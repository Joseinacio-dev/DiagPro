import assert from 'node:assert/strict'
import test from 'node:test'
import { loadUiPreferences, saveUiPreferences, UI_PREFERENCES_KEY } from './settingsPreferences.mjs'

test('preferências locais preservam somente notificações', () => {
  const values = new Map()
  const storage = { getItem: (key) => values.get(key), setItem: (key, value) => values.set(key, value) }
  saveUiPreferences(storage, { notifications: false, apiUrl: 'secret', debug: true })
  assert.deepEqual(JSON.parse(values.get(UI_PREFERENCES_KEY)), { notifications: false })
  assert.deepEqual(loadUiPreferences(storage), { notifications: false })
})
