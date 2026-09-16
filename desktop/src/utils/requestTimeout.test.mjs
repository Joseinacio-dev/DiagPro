import test from 'node:test'
import assert from 'node:assert/strict'
import { withRequestTimeout, API_TIMEOUT_MS, DIAG_IA_TIMEOUT_MS } from './requestTimeout.mjs'

test('IA tem 25s nas duas camadas e API comum preserva 15s', () => {
  assert.equal(DIAG_IA_TIMEOUT_MS, 25000)
  assert.equal(API_TIMEOUT_MS, 15000)
  const options = withRequestTimeout({ timeoutMs: DIAG_IA_TIMEOUT_MS, method: 'POST' })
  assert.equal(options.timeoutMs, undefined)
  assert.equal(options.method, 'POST')
  assert.equal(options.signal.aborted, false)
})
test('cancelamento externo continua funcionando', () => {
  const controller = new AbortController()
  const { signal } = withRequestTimeout({ signal: controller.signal })
  controller.abort()
  assert.equal(signal.aborted, true)
})
test('timeout expira e rejeita valores inválidos', async () => {
  const { signal } = withRequestTimeout({ timeoutMs: 5 })
  await new Promise(resolve => setTimeout(resolve, 20))
  assert.equal(signal.aborted, true)
  for (const timeoutMs of [0, -1, Infinity, 60001]) assert.throws(() => withRequestTimeout({ timeoutMs }))
})
