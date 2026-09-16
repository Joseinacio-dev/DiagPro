const assert = require('node:assert/strict')
const test = require('node:test')
const { createAdbError } = require('./adb/adbErrors')
const { verificarEstado } = require('./deviceDetector')

function authorizedRuntime(sequence = [[{ serial: 'SERIAL-1', status: 'device', model: 'SM A356E' }]]) {
  let index = 0
  return {
    listDevices: async () => sequence[Math.min(index++, sequence.length - 1)],
    collectIdentification: async (serial) => ({ serial, manufacturer: 'Samsung', model: 'SM-A356E', androidVersion: '16' }),
    collectBattery: async () => ({ level: 50 }),
    collectStorage: async () => ({ totalGb: 100, freeGb: 40 }),
    collectMemory: async () => ({ totalGb: 6, availableGb: 2 }),
  }
}

test('detector distingue nenhum dispositivo, unauthorized, offline e multiple', async () => {
  const cases = [
    [[], 'waiting', 'DISCONNECTED'],
    [[{ serial: 'SERIAL-1', status: 'unauthorized' }], 'unauthorized', 'UNAUTHORIZED'],
    [[{ serial: 'SERIAL-1', status: 'offline' }], 'offline', 'OFFLINE'],
    [[{ serial: 'SERIAL-1', status: 'device' }, { serial: 'SERIAL-2', status: 'device' }], 'multiple', 'MULTIPLE'],
  ]
  for (const [devices, status, connectionState] of cases) {
    const result = await verificarEstado({ runtime: { listDevices: async () => devices } })
    assert.equal(result.status, status)
    assert.equal(result.connectionState, connectionState)
  }
})

test('detector retorna AUTHORIZED somente após coletar o dispositivo selecionado', async () => {
  const runtime = authorizedRuntime([[
    { serial: 'SERIAL-1', status: 'device', model: 'SM A356E' },
    { serial: 'SERIAL-2', status: 'device', model: 'Pixel 9' },
  ]])
  const result = await verificarEstado({ selectedSerial: 'SERIAL-2', runtime })
  assert.equal(result.status, 'connected')
  assert.equal(result.connectionState, 'AUTHORIZED')
  assert.equal(result.serial, 'SERIAL-2')
  assert.equal(result.message, 'Dispositivo conectado e pronto para análise.')
})

test('ADB não encontrado vira ADB_UNAVAILABLE sem erro técnico bruto', async () => {
  const result = await verificarEstado({ runtime: {
    listDevices: async () => { throw createAdbError('ADB_NOT_FOUND', 'caminho interno sensível') },
  } })
  assert.equal(result.status, 'adb_unavailable')
  assert.equal(result.connectionState, 'ADB_UNAVAILABLE')
  assert.equal(result.message, 'ADB não está disponível no DiagPro.')
  assert.doesNotMatch(result.message, /caminho interno/i)
})

test('transições unauthorized → authorized e offline → authorized são automáticas', async () => {
  for (const initialStatus of ['unauthorized', 'offline']) {
    const runtime = authorizedRuntime([
      [{ serial: 'SERIAL-1', status: initialStatus }],
      [{ serial: 'SERIAL-1', status: 'device' }],
    ])
    const initial = await verificarEstado({ runtime })
    const authorized = await verificarEstado({ runtime })
    assert.notEqual(initial.connectionState, 'AUTHORIZED')
    assert.equal(authorized.connectionState, 'AUTHORIZED')
  }
})

test('transições disconnected → authorized e authorized → disconnected não reutilizam snapshot antigo', async () => {
  const runtime = authorizedRuntime([
    [],
    [{ serial: 'SERIAL-1', status: 'device' }],
    [],
  ])
  assert.equal((await verificarEstado({ runtime })).connectionState, 'DISCONNECTED')
  assert.equal((await verificarEstado({ runtime })).connectionState, 'AUTHORIZED')
  const disconnected = await verificarEstado({ runtime })
  assert.equal(disconnected.connectionState, 'DISCONNECTED')
  assert.equal(disconnected.serial, undefined)
  assert.deepEqual(disconnected.devices, [])
})
