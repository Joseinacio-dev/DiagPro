const assert = require('node:assert/strict')
const test = require('node:test')
const {
  CONNECTION_STATES,
  createConnectionAssistant,
  pollDelayForState,
} = require('./connectionAssistant')

test('classifica a frequência de polling sem criar ciclo agressivo quando autorizado', () => {
  assert.equal(pollDelayForState({ connectionState: CONNECTION_STATES.DISCONNECTED }), 1500)
  assert.equal(pollDelayForState({ connectionState: CONNECTION_STATES.UNAUTHORIZED }), 1500)
  assert.equal(pollDelayForState({ connectionState: CONNECTION_STATES.AUTHORIZED }), 6000)
})

test('limita a reconexão offline e aplica backoff', () => {
  let time = 1000
  const assistant = createConnectionAssistant({ now: () => time })
  const offline = { connectionState: CONNECTION_STATES.OFFLINE, serial: 'DEVICE-1' }
  assert.deepEqual(assistant.nextReconnect(offline), { serial: 'DEVICE-1', attempt: 1, retryAfterMs: 2000 })
  assert.equal(assistant.nextReconnect(offline), null)
  time = 3000
  assert.deepEqual(assistant.nextReconnect(offline), { serial: 'DEVICE-1', attempt: 2, retryAfterMs: 5000 })
  time = 8000
  assert.deepEqual(assistant.nextReconnect(offline), { serial: 'DEVICE-1', attempt: 3, retryAfterMs: 10000 })
  time = 18000
  assert.equal(assistant.nextReconnect(offline), null)
})

test('autorização reinicia o controle de reconexão offline', () => {
  let time = 0
  const assistant = createConnectionAssistant({ now: () => time })
  const offline = { status: 'offline', serial: 'DEVICE-1' }
  assert.equal(assistant.nextReconnect(offline).attempt, 1)
  assistant.observe({ status: 'connected', serial: 'DEVICE-1' })
  assert.equal(assistant.nextReconnect(offline).attempt, 1)
})

test('seleção aceita somente serial válido e presente na lista recebida do ADB', () => {
  const assistant = createConnectionAssistant()
  const devices = [{ serial: 'DEVICE-1' }]
  assert.equal(assistant.validateSelection('DEVICE-1', devices), 'DEVICE-1')
  assert.throws(() => assistant.validateSelection('DEVICE 1; rm', devices), { code: 'INVALID_DEVICE' })
  assert.throws(() => assistant.validateSelection('DEVICE-2', devices), { code: 'DEVICE_NOT_FOUND' })
})

test('transições esperadas preservam estados ADB distintos', () => {
  const transitions = [
    ['unauthorized', CONNECTION_STATES.UNAUTHORIZED, 'connected', CONNECTION_STATES.AUTHORIZED],
    ['waiting', CONNECTION_STATES.DISCONNECTED, 'connected', CONNECTION_STATES.AUTHORIZED],
    ['connected', CONNECTION_STATES.AUTHORIZED, 'waiting', CONNECTION_STATES.DISCONNECTED],
    ['offline', CONNECTION_STATES.OFFLINE, 'connected', CONNECTION_STATES.AUTHORIZED],
  ]
  for (const [fromStatus, fromState, toStatus, toState] of transitions) {
    assert.equal(require('./connectionAssistant').connectionStateOf({ status: fromStatus }), fromState)
    assert.equal(require('./connectionAssistant').connectionStateOf({ status: toStatus }), toState)
  }
})
