const test = require('node:test')
const assert = require('node:assert/strict')
const { COMPLETE_MODULES, QUICK_MODULES, normalizeScanMode, packagePolicy, scanStages } = require('./scanModes')

test('scanner completo executa módulos reais adicionais ao rápido', () => {
  assert.deepEqual(normalizeScanMode('quick'), [...QUICK_MODULES])
  assert.deepEqual(normalizeScanMode('complete'), [...COMPLETE_MODULES])
  assert.deepEqual(COMPLETE_MODULES.filter((module) => !QUICK_MODULES.includes(module)), ['performance', 'files', 'persistence'])
  assert.deepEqual(packagePolicy('quick').detailsTypes, ['user'])
  assert.deepEqual(packagePolicy('complete').detailsTypes, ['user', 'system'])
})

test('personalizado executa somente módulos válidos selecionados', () => {
  assert.deepEqual(normalizeScanMode('custom', ['files', 'battery', 'files', 'invalid']), ['files', 'battery'])
  assert.deepEqual(scanStages('custom', ['files']).map((stage) => stage.id), ['identification', 'files', 'consolidation'])
  assert.deepEqual(packagePolicy('custom', ['systemApps', 'permissions']), {
    enabled: true,
    types: ['system'],
    detailsTypes: ['system'],
  })
  assert.deepEqual(scanStages('custom', ['permissions']).map((stage) => stage.id), [
    'identification', 'apps', 'permissions', 'consolidation',
  ])
  assert.deepEqual(packagePolicy('custom', ['permissions']), {
    enabled: true,
    types: ['user', 'system'],
    detailsTypes: ['user', 'system'],
  })
})

test('modo desconhecido não usa fallback silencioso para o Scanner Rápido', () => {
  assert.throws(() => normalizeScanMode('completa'), { code: 'INVALID_SCAN_MODE' })
  assert.throws(() => normalizeScanMode('full'), { code: 'INVALID_SCAN_MODE' })
})
