import { clearSession, readRefreshToken, USERNAME_KEY } from './tokenStorage.mjs'

// Browser preview is memory-only. Persistence requires the protected Electron bridge.
export function createSessionStore({ storage, bridge }) {
  let session = { access: null, refresh: null, username: '' }
  let restoring = null
  let generation = 0
  let writes = Promise.resolve()
  const enqueue = operation => (writes = writes.catch(() => {}).then(operation))
  return {
    read: () => ({ ...session }),
    async save(access, refresh, username, remember) {
      generation++
      session = { access, refresh, username }
      clearSession(storage)
      return enqueue(async () => {
        await bridge?.clearSavedSession?.()
        return remember && bridge?.saveSession ? bridge.saveSession({ refresh, username }) : false
      })
    },
    restore() {
      if (restoring) return restoring
      const version = generation
      restoring = (async () => {
        const legacy = readRefreshToken(storage)
        const username = storage.getItem(USERNAME_KEY) || ''
        clearSession(storage)
        const saved = await bridge?.readSavedSession?.()
        if (version !== generation) return
        if (saved?.refresh) session = { access: null, ...saved }
        else if (legacy) {
          session = { access: null, refresh: legacy, username }
          await enqueue(() => bridge?.saveSession?.({ refresh: legacy, username }))
        }
      })().catch(() => {})
      return restoring
    },
    setAccess(access, expectedRefresh) {
      if (session.refresh !== expectedRefresh) return false
      session.access = access
      return true
    },
    clear() {
      generation++
      session = { access: null, refresh: null, username: '' }
      clearSession(storage)
      return enqueue(() => bridge?.clearSavedSession?.())
    },
  }
}
