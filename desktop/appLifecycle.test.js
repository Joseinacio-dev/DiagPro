const assert = require('node:assert/strict')
const test = require('node:test')
const { configureSingleInstance, createShutdownManager, registerFatalErrorHandlers } = require('./appLifecycle')

function fakeApp(lock = true) {
  const listeners = new Map()
  return {
    quitCalls: 0,
    requestSingleInstanceLock: () => lock,
    quit() { this.quitCalls += 1 },
    on(event, listener) { listeners.set(event, listener) },
    emit(event) { listeners.get(event)?.() },
  }
}

test('segunda instância encerra sem criar outra janela', () => {
  const app = fakeApp(false)
  assert.equal(configureSingleInstance({ app, getWindow: () => null }), false)
  assert.equal(app.quitCalls, 1)
})

test('nova abertura restaura e foca a janela da instância principal', () => {
  const app = fakeApp(true)
  const calls = []
  const window = { isDestroyed: () => false, isMinimized: () => true, restore: () => calls.push('restore'), show: () => calls.push('show'), focus: () => calls.push('focus') }
  assert.equal(configureSingleInstance({ app, getWindow: () => window }), true)
  app.emit('second-instance')
  assert.deepEqual(calls, ['restore', 'show', 'focus'])
})

test('shutdown cancela operações e controladores uma única vez', () => {
  const google = new AbortController()
  const monitor = new AbortController()
  let pollingCleared = 0
  let canceled = 0
  const manager = createShutdownManager({
    coordinator: { cancelAll: () => { canceled += 1; return ['scan-1'] } },
    getGoogleController: () => google,
    getMonitorController: () => monitor,
    clearPolling: () => { pollingCleared += 1 },
  })
  assert.deepEqual(manager.shutdown(), ['scan-1'])
  assert.deepEqual(manager.shutdown(), [])
  assert.equal(google.signal.aborted, true)
  assert.equal(monitor.signal.aborted, true)
  assert.equal(pollingCleared, 1)
  assert.equal(canceled, 1)
})

test('falhas fatais registram somente código e exibem aviso seguro', () => {
  const listeners = new Map()
  const logs = []
  let notifications = 0
  registerFatalErrorHandlers({ on: (event, listener) => listeners.set(event, listener) }, {
    log: (event, details) => logs.push({ event, details }),
    notify: () => { notifications += 1 },
  })
  listeners.get('unhandledRejection')(Object.assign(new Error('token=secret'), { code: 'NETWORK_FAILURE' }))
  assert.deepEqual(logs, [{ event: 'unhandled_rejection', details: { code: 'NETWORK_FAILURE' } }])
  assert.equal(notifications, 1)
})
