const { isValidSerial } = require('./adbClient')

const CONNECTION_STATES = Object.freeze({
  DISCONNECTED: 'DISCONNECTED',
  AUTHORIZED: 'AUTHORIZED',
  UNAUTHORIZED: 'UNAUTHORIZED',
  OFFLINE: 'OFFLINE',
  MULTIPLE: 'MULTIPLE',
  ADB_UNAVAILABLE: 'ADB_UNAVAILABLE',
  ERROR: 'ERROR',
})

const CONNECTING_POLL_MS = 1500
const AUTHORIZED_POLL_MS = 6000
const ERROR_POLL_MS = 3000
const OFFLINE_BACKOFF_MS = [2000, 5000, 10000]

function connectionStateOf(state = {}) {
  if (Object.values(CONNECTION_STATES).includes(state.connectionState)) return state.connectionState
  const compatibility = {
    waiting: CONNECTION_STATES.DISCONNECTED,
    disconnected: CONNECTION_STATES.DISCONNECTED,
    connected: CONNECTION_STATES.AUTHORIZED,
    unauthorized: CONNECTION_STATES.UNAUTHORIZED,
    offline: CONNECTION_STATES.OFFLINE,
    multiple: CONNECTION_STATES.MULTIPLE,
    adb_unavailable: CONNECTION_STATES.ADB_UNAVAILABLE,
    error: CONNECTION_STATES.ERROR,
  }
  return compatibility[state.status] || CONNECTION_STATES.ERROR
}

function pollDelayForState(state) {
  const connectionState = connectionStateOf(state)
  if (connectionState === CONNECTION_STATES.AUTHORIZED) return AUTHORIZED_POLL_MS
  if ([CONNECTION_STATES.ADB_UNAVAILABLE, CONNECTION_STATES.ERROR].includes(connectionState)) return ERROR_POLL_MS
  return CONNECTING_POLL_MS
}

function createConnectionAssistant({ now = () => Date.now() } = {}) {
  const reconnects = new Map()

  function resetReconnect(serial) {
    if (serial) reconnects.delete(serial)
    else reconnects.clear()
  }

  function nextReconnect(state) {
    if (connectionStateOf(state) !== CONNECTION_STATES.OFFLINE || !isValidSerial(state?.serial)) return null
    const current = reconnects.get(state.serial) || { attempts: 0, nextAt: 0 }
    if (current.attempts >= OFFLINE_BACKOFF_MS.length || now() < current.nextAt) return null
    const delay = OFFLINE_BACKOFF_MS[current.attempts]
    reconnects.set(state.serial, { attempts: current.attempts + 1, nextAt: now() + delay })
    return { serial: state.serial, attempt: current.attempts + 1, retryAfterMs: delay }
  }

  function observe(state) {
    const connectionState = connectionStateOf(state)
    if (connectionState === CONNECTION_STATES.AUTHORIZED) resetReconnect(state.serial)
    if (connectionState === CONNECTION_STATES.DISCONNECTED) resetReconnect()
    return connectionState
  }

  function validateSelection(serial, devices = []) {
    if (!isValidSerial(serial)) {
      const error = new Error('O dispositivo selecionado é inválido.')
      error.code = 'INVALID_DEVICE'
      throw error
    }
    if (!devices.some((device) => device.serial === serial)) {
      const error = new Error('O dispositivo selecionado não está mais conectado.')
      error.code = 'DEVICE_NOT_FOUND'
      throw error
    }
    return serial
  }

  return { nextReconnect, observe, resetReconnect, validateSelection }
}

module.exports = {
  CONNECTION_STATES,
  OFFLINE_BACKOFF_MS,
  connectionStateOf,
  createConnectionAssistant,
  pollDelayForState,
}
