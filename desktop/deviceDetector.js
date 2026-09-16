const crypto = require('crypto')
const { createAdbClient, isValidSerial } = require('./adb/adbClient')
const { ADB_ERROR_CODES, createAdbError } = require('./adb/adbErrors')
const { CONNECTION_STATES } = require('./adb/connectionAssistant')
const {
  parseAdbDevices,
  parseBattery,
  parseMemory,
  parseStorage,
} = require('./security/parsers/adbParsers')
const { createDeviceCollector } = require('./security/collectors/deviceCollector')
const { createDeviceSecurityCollector } = require('./security/collectors/deviceSecurityCollector')
const { createPackageCollector } = require('./security/collectors/packageCollector')
const { createFileCollector } = require('./security/collectors/fileCollector')
const { createPersistenceCollector } = require('./security/collectors/persistenceCollector')
const { normalizeScanMode, packagePolicy, scanStages } = require('./adb/scanModes')
const { analisarSeguranca } = require('./security/securityAnalyzer')
const { applyRiskToAppProfiles, scoreSecurityRisk } = require('./security/riskScorer')
const { buildSecurityCoverage } = require('./security/securityCoverage')
const { buildTechnicalCoverage } = require('./security/scanCoverage')
const { planejarRemediacoes } = require('./remediation/remediationPlanner')
const { criarExecutorRemediacao } = require('./remediation/remediationExecutor')
const { createRemediationService } = require('./remediation/remediationService')

const ADB_TIMEOUT = 6000
const EXTENDED_ADB_TIMEOUT = 20000
const HASH_ADB_TIMEOUT = 30000
const HASH_BATCH_SIZE = 16
const HASH_BATCH_CONCURRENCY = 2
const MAX_BUFFER = 10 * 1024 * 1024
const APP_DETAILS_CONCURRENCY = 4
const adbClient = createAdbClient()
const deviceCollector = createDeviceCollector({ adb: adbClient })
const securityCollector = createDeviceSecurityCollector({ adb: adbClient, deviceCollector })
const packageCollector = createPackageCollector({
  adb: adbClient,
  deviceCollector,
  securityCollector,
  detailConcurrency: APP_DETAILS_CONCURRENCY,
  extendedTimeout: EXTENDED_ADB_TIMEOUT,
  hashBatchSize: HASH_BATCH_SIZE,
  hashBatchConcurrency: HASH_BATCH_CONCURRENCY,
  hashTimeout: HASH_ADB_TIMEOUT,
})
const fileCollector = createFileCollector({ adb: adbClient })
const persistenceCollector = createPersistenceCollector({ adb: adbClient })

const TERMINAL_SCAN_CODES = new Set([
  ADB_ERROR_CODES.SCAN_ABORTED,
  ADB_ERROR_CODES.DEVICE_DISCONNECTED,
  ADB_ERROR_CODES.DEVICE_NOT_FOUND,
  ADB_ERROR_CODES.DEVICE_OFFLINE,
  ADB_ERROR_CODES.DEVICE_UNAUTHORIZED,
])

function criarErro(codigo, mensagem) {
  return createAdbError(codigo, mensagem)
}

function localizarAdb() {
  return adbClient.executable()
}

function runAdb(args, { timeout = ADB_TIMEOUT, maxBuffer = MAX_BUFFER, signal = null } = {}) {
  return adbClient.run(args, {
    timeout,
    maxBuffer,
    signal,
    deviceCommand: args[0] === '-s',
  })
}

function serialValido(serial) {
  return isValidSerial(serial)
}

function parseDispositivos(saida) {
  return parseAdbDevices(saida).map(({ serial, status, attributes = {} }) => ({
    serial,
    status,
    model: attributes.model ? attributes.model.replace(/_/g, ' ') : null,
  }))
}

function parseBateria(saida) {
  return parseBattery(saida)
}

function parseArmazenamento(saida) {
  return parseStorage(saida)
}

function parseMemoria(saida) {
  return parseMemory(saida)
}

async function listarDispositivos({ signal = null } = {}) {
  return parseDispositivos(await runAdb(['devices', '-l'], { signal }))
}

async function iniciarServidorAdb({ signal = null } = {}) {
  await runAdb(['start-server'], { signal })
  return { ok: true }
}

async function reconectarDispositivo(serial, { signal = null } = {}) {
  if (!serialValido(serial)) throw criarErro('INVALID_DEVICE', 'O dispositivo informado é inválido.')
  await runAdb(['-s', serial, 'reconnect'], { signal })
  return { ok: true }
}

async function validarDispositivoAutorizado(serial, { signal = null } = {}) {
  if (!serialValido(serial)) {
    throw criarErro('INVALID_DEVICE', 'O dispositivo informado é inválido.')
  }

  const dispositivos = await listarDispositivos({ signal })
  const dispositivo = dispositivos.find((item) => item.serial === serial)
  if (!dispositivo) {
    throw criarErro('DEVICE_NOT_FOUND', 'O dispositivo não está mais conectado.')
  }
  if (dispositivo.status === 'unauthorized') {
    throw criarErro('DEVICE_UNAUTHORIZED', 'Autorize a depuração USB no dispositivo para continuar.')
  }
  if (dispositivo.status === 'offline') {
    throw criarErro('DEVICE_OFFLINE', 'O dispositivo está offline. Reconecte o cabo USB e tente novamente.')
  }
  if (dispositivo.status !== 'device') {
    throw criarErro('DEVICE_NOT_READY', 'O dispositivo não está pronto para análise.')
  }
  return dispositivo
}

async function coletarIdentificacao(serial, options = {}) {
  return deviceCollector.collectIdentification(serial, options)
}

async function coletarBateria(serial, options = {}) {
  return deviceCollector.collectBattery(serial, options)
}

async function coletarArmazenamento(serial, options = {}) {
  return deviceCollector.collectStorage(serial, options)
}

async function coletarMemoria(serial, options = {}) {
  return deviceCollector.collectMemory(serial, options)
}

async function verificarAdb({ signal = null } = {}) {
  const output = await runAdb(['version'], { signal })
  const versionMatch = output.match(/Android Debug Bridge version\s+([^\r\n]+)/i)
  return {
    available: true,
    version: versionMatch ? versionMatch[1].trim() : null,
    executable: localizarAdb(),
  }
}

async function coletarSinaisSeguranca(serial, options = {}) {
  return securityCollector.collectSecurity(serial, options)
}

async function listarAppsInstalados(serial, options = {}) {
  if (!options.skipValidation) {
    await validarDispositivoAutorizado(serial, { signal: options.signal || null })
  }
  return packageCollector.listInstalledApps(serial, options)
}

async function coletarAnalisePermissoes(serial, appsExistentes = null, options = {}) {
  const apps = Array.isArray(appsExistentes?.items)
    ? appsExistentes
    : await listarAppsInstalados(serial, { ...options, includeSecurityDetails: true, detailTypes: ['user'] })
  const itensDetalhados = apps.items.filter((app) => app.securityDetails !== undefined)
  const analisados = itensDetalhados.filter((app) => app.securityDetails?.available)
  const indisponiveis = itensDetalhados.length - analisados.length

  return {
    available: analisados.length > 0 || itensDetalhados.length === 0,
    source: 'adb_dumpsys_package',
    analyzedApps: analisados.length,
    unavailableApps: indisponiveis,
    userAppsAnalyzed: analisados.filter((app) => app.type === 'user').length,
    systemAppsAnalyzed: analisados.filter((app) => app.type === 'system').length,
    currentUserId: apps.currentUserId ?? null,
    items: itensDetalhados,
    message: indisponiveis > 0
      ? `Não foi possível consultar detalhes de permissões de ${indisponiveis} pacote(s).`
      : null,
  }
}

function calcularHealthScore(resultado) {
  // Compatibilidade: o Health Score legado ainda considera patch/build. A ETAPA 4
  // não reutiliza esta fórmula; securityRisk é calculado separadamente apenas a
  // partir de findings. A retirada dos sinais de segurança do Health Score exige
  // migração controlada para não alterar históricos já persistidos.
  const armazenamento = resultado.storage
  const bateria = resultado.battery
  const seguranca = resultado.security
  const memoria = resultado.memory
  const evidencias = [
    armazenamento?.usagePercent,
    bateria?.level,
    seguranca?.securityPatch,
    memoria?.availableGb,
  ].filter((valor) => valor !== null && valor !== undefined).length

  if (evidencias < 2) {
    return {
      available: false,
      score: null,
      label: 'Aguardando diagnóstico',
      explanation: 'Ainda não há sinais técnicos suficientes para calcular a saúde do dispositivo.',
      factors: [],
      metricType: 'operational_health_legacy',
    }
  }

  let score = 100
  const factors = []
  if (armazenamento?.usagePercent !== null && armazenamento?.usagePercent !== undefined) {
    if (armazenamento.usagePercent >= 95) {
      score -= 30
      factors.push('Armazenamento acima de 95% de uso')
    } else if (armazenamento.usagePercent >= 90) {
      score -= 20
      factors.push('Armazenamento acima de 90% de uso')
    } else if (armazenamento.usagePercent >= 85) {
      score -= 10
      factors.push('Armazenamento acima de 85% de uso')
    }
  }
  if (bateria?.level !== null && bateria?.level !== undefined && bateria.level <= 10) {
    score -= 10
    factors.push('Bateria abaixo de 10% no momento da coleta')
  }
  if (seguranca?.debuggableBuild === true) {
    score -= 10
    factors.push('Build Android marcado como depurável')
  }
  if (seguranca?.securityPatch) {
    const patch = Date.parse(`${seguranca.securityPatch}T00:00:00Z`)
    if (Number.isFinite(patch)) {
      const idadeDias = Math.floor((Date.now() - patch) / 86400000)
      if (idadeDias > 365) {
        score -= 15
        factors.push('Patch de segurança com mais de 12 meses')
      } else if (idadeDias > 180) {
        score -= 7
        factors.push('Patch de segurança com mais de 6 meses')
      }
    }
  }

  score = Math.max(0, Math.min(100, score))
  const label = score >= 85 ? 'Boa' : score >= 65 ? 'Atenção' : 'Crítica'
  return {
    available: true,
    score,
    label,
    explanation: 'Pontuação calculada apenas com os sinais técnicos coletados neste scan; não representa uma certificação de ausência de malware.',
    factors,
    metricType: 'operational_health_legacy',
    compatibilityNotice: 'Security Risk Score é uma métrica independente e não reutiliza esta fórmula.',
  }
}

function normalizarModo(modo, modulos) {
  return normalizeScanMode(modo, modulos)
}

function scanStatusForError(error) {
  const code = error?.code || error?.codigo
  if (code === ADB_ERROR_CODES.SCAN_ABORTED) return 'canceled'
  if ([ADB_ERROR_CODES.DEVICE_DISCONNECTED, ADB_ERROR_CODES.DEVICE_NOT_FOUND, ADB_ERROR_CODES.DEVICE_OFFLINE].includes(code)) {
    return 'device_disconnected'
  }
  return 'failed'
}

function assertScanActive(signal) {
  if (!signal?.aborted) return
  if (signal.reason instanceof Error) throw signal.reason
  throw createAdbError(ADB_ERROR_CODES.SCAN_ABORTED)
}

function createScanRuntime(overrides = {}) {
  return {
    validateDevice: validarDispositivoAutorizado,
    collectIdentification: coletarIdentificacao,
    listApps: listarAppsInstalados,
    collectPermissions: coletarAnalisePermissoes,
    collectFiles: (serial, options) => fileCollector.collectFiles(serial, options),
    collectSecurity: coletarSinaisSeguranca,
    collectPersistence: (serial, options) => persistenceCollector.collect(serial, options),
    collectBattery: coletarBateria,
    collectStorage: coletarArmazenamento,
    collectMemory: coletarMemoria,
    analyzeSecurity: analisarSeguranca,
    planRemediations: planejarRemediacoes,
    calculateHealth: calcularHealthScore,
    buildTechnicalCoverage,
    buildSecurityCoverage,
    scoreSecurityRisk,
    applyRiskToAppProfiles,
    ...overrides,
  }
}

function stageCounts(stageId, result) {
  if (stageId === 'apps') return {
    found: result.apps?.analysis?.found ?? result.apps?.total ?? null,
    analyzed: result.apps?.analysis?.detailedRequested > 0
      ? result.apps?.analysis?.detailedAnalyzed ?? null
      : result.apps?.analysis?.basicAnalyzed ?? null,
  }
  if (stageId === 'permissions') return {
    found: result.apps?.total ?? null,
    analyzed: result.permissions?.analyzedApps ?? null,
  }
  if (stageId === 'files') return {
    found: result.files?.found ?? null,
    analyzed: result.files?.analyzed ?? null,
  }
  return null
}

function stageOutcome(stageId, result) {
  if (stageId === 'files') {
    if (result.files?.status === 'available') return 'completed'
    if (result.files?.status === 'partial') return 'partial'
    if (result.files?.status === 'failed') return 'failed'
    return 'unavailable'
  }
  if (stageId === 'persistence') {
    if (result.persistence?.status === 'available') return 'completed'
    if (result.persistence?.status === 'partial') return 'partial'
    return 'unavailable'
  }
  if (stageId === 'permissions') {
    if (!result.permissions?.available) return 'unavailable'
    if ((result.permissions?.unavailableApps || 0) > 0) return 'partial'
  }
  if (stageId === 'apps' && result.apps) {
    const requested = result.apps.analysis?.detailedRequested || 0
    const analyzed = result.apps.analysis?.detailedAnalyzed || 0
    if (requested > analyzed) return analyzed > 0 ? 'partial' : 'unavailable'
  }
  return 'completed'
}

function stageMessage(stageId, result, outcome) {
  if (outcome === 'completed') return null
  if (stageId === 'files') {
    if (result.files?.status === 'failed') return 'A enumeração do armazenamento compartilhado falhou.'
    if (result.files?.status === 'not_available') return 'O armazenamento compartilhado não pôde ser enumerado.'
    return result.files?.failures?.[0]?.reason
      || result.files?.limitations?.[0]
      || 'A enumeração de arquivos acessíveis não foi concluída integralmente.'
  }
  if (stageId === 'persistence') {
    const source = [result.persistence?.overlays, result.persistence?.activeServices, result.persistence?.vpn]
      .find((entry) => entry?.status && entry.status !== 'available')
    return source?.reason
      || result.persistence?.limitations?.[0]
      || 'Algumas fontes de persistência não puderam ser consultadas.'
  }
  if (stageId === 'permissions') return result.permissions?.message || 'Detalhes de permissões indisponíveis.'
  if (stageId === 'apps') {
    const requested = result.apps?.analysis?.detailedRequested || 0
    const analyzed = result.apps?.analysis?.detailedAnalyzed || 0
    return `${analyzed} de ${requested} pacote(s) tiveram detalhes técnicos coletados.`
  }
  return null
}

async function executarScan(serial, {
  mode = 'quick',
  modules = [],
  onProgress = () => {},
  signal = null,
  scanId = crypto.randomUUID(),
  runtime: runtimeOverrides = null,
} = {}) {
  const runtime = createScanRuntime(runtimeOverrides || {})
  assertScanActive(signal)
  try {
    await runtime.validateDevice(serial, { signal })
  } catch (error) {
    error.scanId = scanId
    error.scanStatus = scanStatusForError(error)
    throw error
  }
  const modulos = normalizarModo(mode, modules)
  const politicaPacotes = packagePolicy(mode, modules)
  const cache = new Map()
  const etapas = scanStages(mode, modules)

  const resultado = {
    scanId,
    status: 'running',
    mode,
    modules: modulos,
    startedAt: new Date().toISOString(),
    device: null,
    system: null,
    apps: null,
    security: null,
    battery: null,
    storage: null,
    memory: null,
    permissions: null,
    files: null,
    persistence: null,
    technicalCoverage: null,
    health: null,
    securityRisk: null,
    threats: [],
    remediations: [],
    warnings: [],
    stages: {},
  }

  for (let indice = 0; indice < etapas.length; indice += 1) {
    assertScanActive(signal)
    const etapa = etapas[indice]
    const stageStartedMs = Date.now()
    resultado.stages[etapa.id] = { status: 'running', startedAt: new Date().toISOString() }
    onProgress({
      stage: etapa.id,
      label: etapa.label,
      status: 'running',
      index: indice,
      total: etapas.length,
      progress: Math.round((indice / etapas.length) * 100),
      scanId,
    })

    try {
      if (etapa.id === 'identification') {
        resultado.device = await runtime.collectIdentification(serial, { signal, cache })
      } else if (etapa.id === 'system') {
        // A identificação já coletou o snapshot global de propriedades; não repete getprop.
        resultado.system = resultado.device ? { ...resultado.device } : await runtime.collectIdentification(serial, { signal, cache })
      } else if (etapa.id === 'apps') {
        resultado.apps = await runtime.listApps(serial, {
          skipValidation: true,
          types: politicaPacotes.types,
          detailTypes: politicaPacotes.detailsTypes,
          includeSecurityDetails: politicaPacotes.detailsTypes.length > 0,
          includeExtendedStates: mode === 'complete' || modulos.includes('persistence'),
          includeHashes: mode === 'complete',
          currentUserId: resultado.device?.androidUsers?.currentUserId ?? undefined,
          signal,
          cache,
        })
      } else if (etapa.id === 'permissions') {
        resultado.permissions = await runtime.collectPermissions(serial, resultado.apps, { signal, cache })
        if (resultado.permissions.unavailableApps > 0) {
          resultado.warnings.push({
            stage: 'permissions',
            code: 'PARTIAL_PERMISSION_COLLECTION',
            message: resultado.permissions.message,
          })
        }
      } else if (etapa.id === 'files') {
        resultado.files = await runtime.collectFiles(serial, {
          signal,
          onProgress: (counters) => onProgress({
            stage: etapa.id,
            label: etapa.label,
            status: 'running',
            index: indice,
            total: etapas.length,
            progress: Math.round(((indice + 0.5) / etapas.length) * 100),
            counters,
            scanId,
          }),
        })
        if (resultado.files.status !== 'available') {
          resultado.warnings.push({
            stage: 'files',
            code: resultado.files.status === 'failed' ? 'FILE_COLLECTION_FAILED' : 'PARTIAL_FILE_COLLECTION',
            message: resultado.files.status === 'failed'
              ? 'A varredura de arquivos falhou; nenhum resultado zero foi presumido.'
              : resultado.files.status === 'not_available'
                ? 'O armazenamento compartilhado não pôde ser enumerado.'
                : 'A varredura de arquivos foi concluída parcialmente.',
          })
        }
      } else if (etapa.id === 'security') {
        resultado.security = await runtime.collectSecurity(serial, { signal, cache })
      } else if (etapa.id === 'persistence') {
        resultado.persistence = await runtime.collectPersistence(serial, {
          signal,
          security: resultado.security,
          apps: resultado.apps,
        })
        if (resultado.persistence.status !== 'available') {
          resultado.warnings.push({
            stage: 'persistence',
            code: 'PARTIAL_PERSISTENCE_COLLECTION',
            message: 'Algumas fontes de persistência não estão acessíveis neste dispositivo.',
          })
        }
      } else if (etapa.id === 'battery') {
        resultado.battery = await runtime.collectBattery(serial, { signal })
      } else if (etapa.id === 'storage') {
        resultado.storage = await runtime.collectStorage(serial, { signal })
      } else if (etapa.id === 'performance') {
        resultado.memory = await runtime.collectMemory(serial, { signal })
      } else if (etapa.id === 'consolidation') {
        assertScanActive(signal)
        const analiseSeguranca = runtime.analyzeSecurity(resultado)
        const remediationActions = runtime.planRemediations(
          analiseSeguranca.findings,
          resultado.apps?.items || resultado.permissions?.items || [],
        )
        if (resultado.security || analiseSeguranca.observations.length > 0 || analiseSeguranca.findings.length > 0) {
          resultado.security = {
            ...(resultado.security || { collectionAvailable: false }),
            schemaVersion: analiseSeguranca.schemaVersion,
            analysisVersion: analiseSeguranca.analysisVersion,
            observations: analiseSeguranca.observations,
            findings: analiseSeguranca.findings,
            appRiskProfiles: analiseSeguranca.appRiskProfiles,
            confirmedThreats: analiseSeguranca.confirmedThreats,
            reputation: analiseSeguranca.reputation,
            remediationActions,
          }
        }
        resultado.confirmedThreats = analiseSeguranca.confirmedThreats
        resultado.threats = analiseSeguranca.confirmedThreats
        resultado.health = runtime.calculateHealth(resultado)
      }
      const outcome = stageOutcome(etapa.id, resultado)
      const outcomeMessage = stageMessage(etapa.id, resultado, outcome)
      resultado.stages[etapa.id] = {
        ...resultado.stages[etapa.id],
        status: outcome,
        finishedAt: new Date().toISOString(),
        durationMs: Date.now() - stageStartedMs,
        counts: stageCounts(etapa.id, resultado),
        message: outcomeMessage,
      }
      onProgress({
        stage: etapa.id,
        label: etapa.label,
        status: outcome,
        index: indice + 1,
        total: etapas.length,
        progress: Math.round(((indice + 1) / etapas.length) * 100),
        scanId,
        message: outcomeMessage,
      })
    } catch (erro) {
      const code = erro.code || erro.codigo
      if (TERMINAL_SCAN_CODES.has(code) || signal?.aborted) {
        const finalStatus = scanStatusForError(erro)
        resultado.status = finalStatus
        resultado.stages[etapa.id] = {
          ...resultado.stages[etapa.id],
          status: finalStatus,
          finishedAt: new Date().toISOString(),
          durationMs: Date.now() - stageStartedMs,
          counts: stageCounts(etapa.id, resultado),
        }
        onProgress({
          stage: etapa.id,
          label: etapa.label,
          status: finalStatus,
          index: indice,
          total: etapas.length,
          progress: Math.round((indice / etapas.length) * 100),
          message: erro.message,
          scanId,
        })
        erro.scanId = scanId
        erro.scanStatus = finalStatus
        throw erro
      }
      const predictableUnavailable = [
        ADB_ERROR_CODES.ADB_TIMEOUT,
        ADB_ERROR_CODES.COMMAND_NOT_SUPPORTED,
      ].includes(code) || /permission (?:denied|denial)/i.test(erro.message || '')
      const failureStatus = predictableUnavailable ? 'unavailable' : 'failed'
      resultado.stages[etapa.id] = {
        ...resultado.stages[etapa.id],
        status: failureStatus,
        finishedAt: new Date().toISOString(),
        durationMs: Date.now() - stageStartedMs,
        counts: stageCounts(etapa.id, resultado),
        error: { code: code || 'COLLECTION_FAILED', message: erro.message || 'Falha durante a coleta.' },
      }
      resultado.warnings.push({ stage: etapa.id, code: code || 'COLLECTION_UNAVAILABLE', message: erro.message })
      onProgress({
        stage: etapa.id,
        label: etapa.label,
        status: failureStatus,
        index: indice + 1,
        total: etapas.length,
        progress: Math.round(((indice + 1) / etapas.length) * 100),
        message: erro.message,
        scanId,
      })
    }
  }

  assertScanActive(signal)
  await runtime.validateDevice(serial, { signal })
  const incompleteStage = Object.values(resultado.stages).some((stage) => stage.status !== 'completed')
  resultado.status = resultado.warnings.length > 0 || incompleteStage ? 'partial' : 'completed'
  resultado.technicalCoverage = runtime.buildTechnicalCoverage(resultado)
  const securityCoverage = runtime.buildSecurityCoverage(resultado)
  resultado.securityRisk = runtime.scoreSecurityRisk({
    findings: resultado.security?.findings || [],
    coverage: securityCoverage,
    scanStatus: resultado.status,
    confirmedThreats: resultado.confirmedThreats || [],
  })
  if (resultado.security) {
    resultado.security = {
      ...resultado.security,
      securityRisk: resultado.securityRisk,
      appRiskProfiles: runtime.applyRiskToAppProfiles(resultado.security.appRiskProfiles || [], resultado.securityRisk),
    }
  }
  resultado.finishedAt = new Date().toISOString()
  resultado.durationMs = Math.max(0, Date.parse(resultado.finishedAt) - Date.parse(resultado.startedAt))
  resultado.moduleStatus = Object.fromEntries(
    Object.entries(resultado.stages).map(([id, stage]) => [id, stage.status]),
  )
  resultado.fileCoverage = resultado.files ? {
    status: resultado.files.status,
    collectionState: resultado.files.collectionState,
    rootsTested: resultado.files.rootDiagnostics?.length || 0,
    rootsAccessible: resultado.files.rootDiagnostics?.filter((root) => root.accessible).length || 0,
    found: resultado.files.found,
    analyzed: resultado.files.analyzed,
    zeroConfirmed: resultado.files.zeroConfirmed === true,
  } : null
  resultado.coverage = {
    modules: resultado.technicalCoverage,
    device: {
      status: resultado.technicalCoverage?.status || 'not_available',
      explanation: 'Cobertura limitada às fontes acessíveis via ADB sem root; não representa percentual integral do dispositivo.',
    },
  }
  resultado.limitations = [...new Set([
    ...(resultado.files?.limitations || []),
    ...(resultado.persistence?.limitations || []),
    ...(resultado.technicalCoverage?.limitations || []),
  ])]
  return resultado
}

async function coletarDiagnostico(serial, options = {}) {
  const resultado = await executarScan(serial, { mode: 'quick', signal: options.signal || null })
  return {
    ...resultado,
    armazenamento: resultado.storage || { totalGb: null, usedGb: null, freeGb: null },
    memoria: resultado.memory || { totalGb: null, availableGb: null, usedGb: null },
    totalApps: resultado.apps?.total ?? null,
  }
}

async function verificarEstado({ selectedSerial = null, runtime = {}, signal = null } = {}) {
  const listDevices = runtime.listDevices || listarDispositivos
  const collectIdentification = runtime.collectIdentification || coletarIdentificacao
  const collectBattery = runtime.collectBattery || coletarBateria
  const collectStorage = runtime.collectStorage || coletarArmazenamento
  const collectMemory = runtime.collectMemory || coletarMemoria
  let dispositivos
  try {
    dispositivos = await listDevices({ signal })
  } catch (erro) {
    if (erro.codigo === 'ADB_NOT_FOUND') {
      return {
        status: 'adb_unavailable',
        connectionState: CONNECTION_STATES.ADB_UNAVAILABLE,
        code: 'ADB_NOT_FOUND',
        message: 'ADB não está disponível no DiagPro.',
      }
    }
    if (erro.codigo === 'ADB_TIMEOUT') {
      return {
        status: 'adb_unavailable',
        connectionState: CONNECTION_STATES.ADB_UNAVAILABLE,
        code: 'ADB_TIMEOUT',
        message: 'O serviço de dispositivos demorou para responder. Verifique o ADB e o cabo USB.',
      }
    }
    return {
      status: 'adb_unavailable',
      connectionState: CONNECTION_STATES.ADB_UNAVAILABLE,
      code: 'ADB_UNAVAILABLE',
      message: 'Não foi possível comunicar com o ADB. Verifique a instalação, os drivers USB e o cabo.',
    }
  }

  if (dispositivos.length === 0) return {
    status: 'waiting',
    connectionState: CONNECTION_STATES.DISCONNECTED,
    message: 'Conecte um dispositivo Android pelo cabo USB.',
    devices: [],
  }
  if (dispositivos.length > 1 && !dispositivos.some((device) => device.serial === selectedSerial)) return {
    status: 'multiple',
    connectionState: CONNECTION_STATES.MULTIPLE,
    message: 'Mais de um dispositivo foi encontrado. Selecione o aparelho que deseja analisar.',
    devices: dispositivos,
  }

  const alvo = dispositivos.find((device) => device.serial === selectedSerial) || dispositivos[0]
  if (alvo.status === 'unauthorized') return {
    status: 'unauthorized', connectionState: CONNECTION_STATES.UNAUTHORIZED, serial: alvo.serial, devices: dispositivos,
    message: 'Desbloqueie o celular e confirme “Permitir depuração USB”.',
  }
  if (alvo.status === 'offline') return {
    status: 'offline', connectionState: CONNECTION_STATES.OFFLINE, serial: alvo.serial, devices: dispositivos,
    message: 'Reconectando ao dispositivo…',
  }
  if (alvo.status !== 'device') {
    return {
      status: 'error',
      connectionState: CONNECTION_STATES.ERROR,
      code: 'ADB_UNKNOWN_STATUS',
      serial: alvo.serial,
      adbStatus: alvo.status,
      message: 'O dispositivo retornou um estado de conexão não reconhecido.',
    }
  }

  try {
    const device = await collectIdentification(alvo.serial, { signal })
    const battery = await collectBattery(alvo.serial, { signal })
    const storage = await collectStorage(alvo.serial, { signal })
    const memory = await collectMemory(alvo.serial, { signal })
    return {
      status: 'connected',
      connectionState: CONNECTION_STATES.AUTHORIZED,
      message: 'Dispositivo conectado e pronto para análise.',
      serial: alvo.serial,
      devices: dispositivos,
      ...device,
      battery,
      storage,
      memory,
    }
  } catch (erro) {
    if ([ADB_ERROR_CODES.DEVICE_DISCONNECTED, ADB_ERROR_CODES.DEVICE_NOT_FOUND].includes(erro.codigo)) {
      return { status: 'waiting', connectionState: CONNECTION_STATES.DISCONNECTED, message: 'Dispositivo desconectado.', devices: [] }
    }
    if (erro.codigo === ADB_ERROR_CODES.DEVICE_UNAUTHORIZED) {
      return { status: 'unauthorized', connectionState: CONNECTION_STATES.UNAUTHORIZED, serial: alvo.serial, devices: dispositivos, message: 'Desbloqueie o celular e confirme “Permitir depuração USB”.' }
    }
    if (erro.codigo === ADB_ERROR_CODES.DEVICE_OFFLINE) {
      return { status: 'offline', connectionState: CONNECTION_STATES.OFFLINE, serial: alvo.serial, devices: dispositivos.map((device) => device.serial === alvo.serial ? { ...device, status: 'offline' } : device), message: 'Reconectando ao dispositivo…' }
    }
    return {
      status: 'error',
      connectionState: CONNECTION_STATES.ERROR,
      code: erro.codigo || 'DEVICE_COMMUNICATION',
      serial: alvo.serial,
      message: 'O dispositivo foi autorizado, mas não foi possível ler suas informações.',
    }
  }
}

const remediationService = createRemediationService({
  listInstalledApps: listarAppsInstalados,
  validateDevice: validarDispositivoAutorizado,
  runAdb,
  collectDeviceAdmins: (serial, options) => securityCollector.collectDeviceAdmins(serial, options),
  getDeviceInfo: coletarIdentificacao,
})

async function obterPreviewRemocao(serialOrOptions, packageName) {
  const options = typeof serialOrOptions === 'object' && serialOrOptions !== null
    ? serialOrOptions
    : { serial: serialOrOptions, packageName }
  return remediationService.createRemovalPreview(options)
}

async function executarDesinstalacaoComToken(options) {
  return remediationService.executeUninstall(options)
}

async function verificarAusenciaPacoteUsuario(options) {
  return remediationService.verifyPackageAbsent(options)
}

const remediationExecutor = criarExecutorRemediacao({
  uninstall: executarDesinstalacaoComToken,
  verify: verificarAusenciaPacoteUsuario,
})

async function desinstalarAppUsuario(serialOrOptions, packageName, confirmationToken, findingId = null) {
  const options = typeof serialOrOptions === 'object' && serialOrOptions !== null
    ? serialOrOptions
    : { serial: serialOrOptions, packageName, confirmationToken, findingId }
  return remediationExecutor.execute(options)
}

function cancelarRemediacao(actionId, confirmationToken) {
  return remediationService.cancelPreview({ actionId, confirmationToken })
}

module.exports = {
  coletarDiagnostico,
  cancelarRemediacao,
  desinstalarAppUsuario,
  executarScan,
  iniciarServidorAdb,
  listarAppsInstalados,
  obterPreviewRemocao,
  reconectarDispositivo,
  verificarAdb,
  verificarEstado,
}
