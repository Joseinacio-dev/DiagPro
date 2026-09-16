import test from 'node:test'
import assert from 'node:assert/strict'
import { createSessionStore } from './sessionStore.mjs'
import { ACCESS_KEY, REFRESH_KEY, USERNAME_KEY } from './tokenStorage.mjs'
function fixture() {
  const entries = new Map()
  const storage = { getItem: key => entries.get(key), removeItem: key => entries.delete(key) }
  let saved = null
  const bridge = { saveSession: async value => { saved = value; return true }, readSavedSession: async () => saved, clearSavedSession: async () => { saved = null } }
  return { entries, storage, bridge, saved: () => saved }
}
test('lembrar protege apenas refresh; access não persiste', async () => {
  const f = fixture(); const store = createSessionStore(f)
  await store.save('access', 'refresh', 'user', true)
  assert.deepEqual(f.saved(), { refresh: 'refresh', username: 'user' })
  assert.equal(f.entries.size, 0)
  await store.clear()
  assert.equal(f.saved(), null)
  assert.equal(store.read().access, null)
})
test('sem lembrar e navegador permanecem em memória', async () => {
  const f = fixture(); const store = createSessionStore(f)
  await store.save('access', 'refresh', 'user', false)
  assert.equal(store.read().access, 'access')
  assert.equal(f.saved(), null)
  const browser = createSessionStore({ storage: f.storage })
  assert.equal(await browser.save('access', 'refresh', 'user', true), false)
  assert.equal(f.entries.size, 0)
})
test('migração apaga todos tokens antigos e não restaura após logout', async () => {
  const f = fixture()
  f.entries.set(ACCESS_KEY, 'old-access'); f.entries.set(REFRESH_KEY, 'old-refresh'); f.entries.set(USERNAME_KEY, 'user')
  const store = createSessionStore(f)
  await store.restore()
  assert.equal(f.entries.size, 0)
  assert.equal(f.saved().refresh, 'old-refresh')
  await store.clear()
  assert.equal(store.setAccess('late-access', 'old-refresh'), false)
})
