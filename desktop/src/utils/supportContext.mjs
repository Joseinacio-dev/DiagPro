const MODE_LABELS = { quick: 'Rápido', complete: 'Completo', custom: 'Personalizado' }

export function settingsTabsForProfile(user) {
  const tabs = ['general', 'device', 'support', 'about']
  return user?.is_staff === true || user?.is_superuser === true ? [...tabs, 'admin'] : tabs
}

export function buildSupportContext({ device = {}, scanSession = null } = {}) {
  const result = scanSession?.result || null
  const stages = result?.stages && typeof result.stages === 'object' ? result.stages : {}
  const unavailableModules = Object.entries(stages)
    .filter(([, stage]) => stage?.status && stage.status !== 'completed')
    .map(([name]) => name)
  const findings = Array.isArray(result?.security?.findings) ? result.security.findings.length : 0
  const coverage = result?.technicalCoverage || null
  const riskScore = result?.securityRisk?.available === false ? null : result?.securityRisk?.score
  return {
    device: {
      status: device.status || 'waiting',
      manufacturer: device.manufacturer || device.fabricante || null,
      model: device.model || device.modelo || null,
      android: device.androidVersion || device.versaoAndroid || null,
    },
    scan: {
      status: scanSession?.status || 'idle',
      mode: MODE_LABELS[scanSession?.mode] || scanSession?.mode || null,
      findings,
      coveragePercent: Number.isFinite(coverage?.percent) ? coverage.percent : null,
      coverageStatus: coverage?.status || null,
      unavailableModules,
      moduleStatuses: result?.moduleStatus || Object.fromEntries(Object.entries(stages).map(([name, stage]) => [name, stage?.status || 'unavailable'])),
      appsFound: Number.isInteger(result?.apps?.total) ? result.apps.total : null,
      filesAnalyzed: Number.isInteger(result?.files?.analyzed) ? result.files.analyzed : null,
      riskScore: Number.isInteger(riskScore) ? riskScore : null,
      limitations: Array.isArray(result?.limitations) ? result.limitations : [],
    },
  }
}

export const DIAG_IA_ACTIONS = [
  ['connect', 'Como conectar meu celular?'],
  ['partial', 'Por que meu scan ficou parcial?'],
  ['result', 'Explicar resultado do scanner'],
  ['adb', 'Problema com ADB'],
  ['offline', 'Meu dispositivo está offline'],
  ['license', 'Como funciona a licença?'],
  ['finding', 'O que significa finding?'],
  ['support', 'Abrir chamado de suporte'],
]

export function localDiagIaAnswer(actionId, context) {
  const answers = {
    connect: 'Use um cabo USB de dados, desbloqueie o Android, ative a Depuração USB e aceite a autorização exibida no aparelho.',
    partial: `Um scan fica parcial quando algum módulo não pôde ser coletado. Módulos limitados nesta sessão: ${context?.scan?.unavailableModules?.join(', ') || 'não informados'}.`,
    result: `O último scan está como ${context?.scan?.status || 'não realizado'}, no modo ${context?.scan?.mode || 'não informado'}, com ${context?.scan?.findings ?? 0} finding(s) registrado(s).`,
    adb: 'Confirme a Depuração USB, a autorização deste computador e o modo USB para transferência de dados. Depois use “Testar conexão”.',
    offline: 'Mantenha o aparelho desbloqueado, reconecte o cabo de dados e confirme novamente a autorização ADB no Android.',
    license: 'Atualize a tela Plano e assinatura. Se o plano continuar ausente, confirme a conta usada no login e aguarde a sincronização do backend.',
    finding: 'Um finding é um achado técnico que merece revisão. Ele não significa automaticamente ameaça, vírus ou malware.',
    support: 'Vou preparar uma prévia sanitizada do chamado. O envio automático ao suporte humano ainda não está disponível nesta versão.',
  }
  return answers[actionId] || 'Esta orientação ainda não está disponível. Nenhuma ação foi executada no dispositivo.'
}
