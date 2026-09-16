const fs = require('node:fs')
const path = require('node:path')

// Only the main process chooses the path. Never fall back to plaintext.
function createSessionVault({ directory, safeStorage }) {
  const file = path.join(directory, 'session.encrypted')
  function clear() { fs.rmSync(file, { force: true }) }
  function available() {
    return safeStorage.isEncryptionAvailable()
      && safeStorage.getSelectedStorageBackend?.() !== 'basic_text'
  }
  function save({ refresh, username }) {
    if (typeof refresh !== 'string' || refresh.length < 10 || refresh.length > 16384
      || typeof username !== 'string' || username.length > 254) throw new Error('Sessão inválida.')
    if (!available()) { clear(); return false }
    fs.mkdirSync(directory, { recursive: true })
    const encrypted = safeStorage.encryptString(JSON.stringify({ refresh, username }))
    const temporary = `${file}.tmp`
    try {
      fs.writeFileSync(temporary, encrypted, { mode: 0o600 })
      fs.rmSync(file, { force: true })
      fs.renameSync(temporary, file)
    } finally { fs.rmSync(temporary, { force: true }) }
    return true
  }
  function read() {
    if (!available()) return null
    try {
      if (fs.statSync(file).size > 65536) return null
      const session = JSON.parse(safeStorage.decryptString(fs.readFileSync(file)))
      return typeof session.refresh === 'string' && session.refresh.length <= 16384
        && typeof session.username === 'string' && session.username.length <= 254 ? session : null
    } catch { return null }
  }
  return { save, read, clear }
}
module.exports = { createSessionVault }
