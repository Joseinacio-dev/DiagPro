const test = require('node:test')
const assert = require('node:assert/strict')
const { buildTechnicalCoverage } = require('./scanCoverage')

test('cobertura usa contagens reais de apps, arquivos e módulos', () => {
  const coverage = buildTechnicalCoverage({
    stages: { apps: { status: 'completed' }, files: { status: 'completed' }, battery: { status: 'completed' } },
    apps: { analysis: { found: 10, detailedRequested: 10, detailedAnalyzed: 8 } },
    files: { found: 20, analyzed: 18, limitations: ['Área privada inacessível.'] },
  })
  assert.equal(coverage.expectedUnits, 31)
  assert.equal(coverage.completedUnits, 27)
  assert.equal(coverage.percent, 87)
  assert.equal(coverage.status, 'limited')
})

test('módulo indisponível não recebe crédito de conclusão', () => {
  const coverage = buildTechnicalCoverage({ stages: {
    battery: { status: 'unavailable' },
    storage: { status: 'completed' },
    persistence: { status: 'partial' },
    files: { status: 'failed' },
  } })
  assert.equal(coverage.percent, 25)
  assert.equal(coverage.modulesCompleted, 1)
  assert.equal(coverage.modulesPartial, 1)
  assert.equal(coverage.modulesUnavailable, 1)
  assert.equal(coverage.modulesFailed, 1)
  assert.equal(coverage.modulesProcessed, 4)
  assert.equal(coverage.modulesProcessedPercent, 100)
})
