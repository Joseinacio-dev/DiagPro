const test = require('node:test')
const assert = require('node:assert/strict')
const { executarScan } = require('./deviceDetector')

function runtimeFixture(overrides = {}) {
  const calls = []
  const record = (name, value) => async () => {
    calls.push(name)
    return typeof value === 'function' ? value() : value
  }
  const apps = {
    total: 2,
    userTotal: 1,
    systemTotal: 1,
    currentUserId: 0,
    items: [
      { packageName: 'com.example.user', type: 'user', securityDetails: { available: true } },
      { packageName: 'com.example.system', type: 'system', securityDetails: { available: true } },
    ],
    analysis: { found: 2, basicAnalyzed: 2, detailedRequested: 2, detailedAnalyzed: 2 },
  }
  return {
    calls,
    runtime: {
      validateDevice: record('validateDevice', { serial: 'SERIAL', status: 'device' }),
      collectIdentification: record('identification', { androidUsers: { currentUserId: 0 } }),
      listApps: async (_serial, options) => {
        calls.push('apps')
        calls.push(`appTypes:${options.detailTypes.join(',')}`)
        return apps
      },
      collectPermissions: record('permissions', {
        available: true, analyzedApps: 2, unavailableApps: 0, items: apps.items,
      }),
      collectFiles: record('files', {
        status: 'available', found: 3, analyzed: 3, items: [], limitations: [],
      }),
      collectSecurity: record('security', { collectionAvailable: true }),
      collectPersistence: record('persistence', { status: 'available' }),
      collectBattery: record('battery', { level: 80 }),
      collectStorage: record('storage', { totalGb: 100, freeGb: 40, usagePercent: 60 }),
      collectMemory: record('performance', { totalGb: 8, availableGb: 3 }),
      analyzeSecurity: () => ({
        schemaVersion: 'test', analysisVersion: 'test', observations: [], findings: [],
        appRiskProfiles: [], confirmedThreats: [], reputation: null,
      }),
      planRemediations: () => [],
      calculateHealth: () => ({ available: true, score: 100, label: 'Boa' }),
      buildSecurityCoverage: () => ({ status: 'sufficient', percent: 100 }),
      scoreSecurityRisk: () => ({ status: 'calculated', score: 0, label: 'Baixo risco observado' }),
      applyRiskToAppProfiles: (profiles) => profiles,
      ...overrides,
    },
  }
}

test('Scanner Completo chama arquivos, persistência e sempre calcula cobertura técnica', async () => {
  const { runtime, calls } = runtimeFixture()
  const result = await executarScan('SERIAL', { mode: 'complete', runtime })

  assert.ok(calls.includes('files'), 'fileCollector precisa ser chamado no Completo')
  assert.ok(calls.includes('persistence'), 'persistenceCollector precisa ser chamado no Completo')
  assert.ok(calls.includes('appTypes:user,system'), 'apps de usuário e sistema precisam ser detalhados')
  assert.ok(result.technicalCoverage, 'cobertura técnica é obrigatória no Completo')
  assert.deepEqual(Object.keys(result.stages), [
    'identification', 'system', 'apps', 'permissions', 'files', 'security',
    'persistence', 'battery', 'storage', 'performance', 'consolidation',
  ])
  for (const stage of Object.values(result.stages)) {
    assert.equal(Number.isFinite(stage.durationMs), true)
    assert.ok(stage.durationMs >= 0)
  }
  assert.equal(Number.isFinite(result.durationMs), true)
  assert.equal(result.moduleStatus.files, 'completed')
  assert.equal(result.fileCoverage.status, 'available')
  assert.equal(result.coverage.device.status, result.technicalCoverage.status)
  assert.ok(Array.isArray(result.limitations))
})

test('Scanner Rápido não chama arquivos, persistência nem hashes de apps de sistema', async () => {
  const { runtime, calls } = runtimeFixture()
  const result = await executarScan('SERIAL', { mode: 'quick', runtime })

  assert.equal(calls.includes('files'), false)
  assert.equal(calls.includes('persistence'), false)
  assert.equal(calls.includes('performance'), false)
  assert.ok(calls.includes('appTypes:user'))
  assert.equal(result.files, null)
  assert.equal(result.persistence, null)
})

test('falha previsível de arquivos não é ocultada e ainda produz cobertura parcial', async () => {
  const { runtime } = runtimeFixture({
    collectFiles: async () => ({
      status: 'not_available', found: 0, analyzed: 0, items: [],
      limitations: ['find não disponível neste dispositivo.'],
    }),
    collectPersistence: async () => ({ status: 'partial' }),
  })
  const result = await executarScan('SERIAL', { mode: 'complete', runtime })

  assert.equal(result.status, 'partial')
  assert.equal(result.stages.files.status, 'unavailable')
  assert.equal(result.stages.persistence.status, 'partial')
  assert.ok(result.technicalCoverage)
  assert.equal(result.technicalCoverage.status, 'limited')
  assert.equal(result.technicalCoverage.modulesUnavailable, 1)
  assert.equal(result.technicalCoverage.modulesPartial, 1)
})

test('falha total da coleta de arquivos mantém scan local parcial e etapa falhou', async () => {
  const { runtime } = runtimeFixture({
    collectFiles: async () => ({
      status: 'failed', collectionState: 'FAILED', found: 0, analyzed: 0,
      zeroConfirmed: false, items: [], limitations: ['Falha de enumeração.'],
    }),
  })
  const result = await executarScan('SERIAL', { mode: 'complete', runtime })

  assert.equal(result.status, 'partial')
  assert.equal(result.stages.files.status, 'failed')
  assert.equal(result.fileCoverage.zeroConfirmed, false)
  assert.equal(result.warnings.some((warning) => warning.code === 'FILE_COLLECTION_FAILED'), true)
})
