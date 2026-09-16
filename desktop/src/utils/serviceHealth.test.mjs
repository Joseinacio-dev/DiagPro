import assert from 'node:assert/strict'
import test from 'node:test'
import { checkApiHealth } from './serviceHealth.mjs'

test('API online é reconhecida na primeira tentativa', async () => {
  const result = await checkApiHealth({
    apiBaseUrl: 'https://api.example.test',
    fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ status: 'ok' }) }),
  })
  assert.deepEqual(result, { status: 'online', attempts: 1 })
})

test('cold start é tolerado com tentativas limitadas', async () => {
  let calls = 0
  const result = await checkApiHealth({
    apiBaseUrl: 'https://api.example.test',
    fetchImpl: async () => {
      calls += 1
      if (calls < 3) throw new TypeError('network')
      return { ok: true, status: 200, json: async () => ({ status: 'ok' }) }
    },
    waitImpl: async () => {},
  })
  assert.deepEqual(result, { status: 'online', attempts: 3 })
  assert.equal(calls, 3)
})

test('API indisponível encerra após três tentativas sem loop infinito', async () => {
  let calls = 0
  const result = await checkApiHealth({
    apiBaseUrl: 'https://api.example.test',
    fetchImpl: async () => { calls += 1; throw new TypeError('network details') },
    waitImpl: async () => {},
  })
  assert.deepEqual(result, { status: 'offline', attempts: 3, code: 'UNAVAILABLE' })
  assert.equal(calls, 3)
})

test('resposta inesperada nunca é tratada como API saudável', async () => {
  const result = await checkApiHealth({
    apiBaseUrl: 'https://api.example.test',
    attempts: 1,
    fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ debug: 'internal' }) }),
  })
  assert.equal(result.status, 'offline')
  assert.equal(Object.hasOwn(result, 'message'), false)
})
