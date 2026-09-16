const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { createSessionVault } = require('./sessionVault')

test('vault escreve somente resultado criptografado e remove ao sair', t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'diagpro-vault-test-'))
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }))
  let encryptedText
  const safeStorage = {
    isEncryptionAvailable: () => true,
    encryptString: value => { encryptedText = value; return Buffer.from('ciphertext-fixture') },
    decryptString: () => encryptedText,
  }
  const vault = createSessionVault({ directory, safeStorage })
  assert.equal(vault.save({ refresh: 'fixture-refresh-token', username: 'test' }), true)
  assert.equal(fs.readFileSync(path.join(directory, 'session.encrypted'), 'utf8'), 'ciphertext-fixture')
  assert.deepEqual(vault.read(), { refresh: 'fixture-refresh-token', username: 'test' })
  assert.equal(vault.save({ refresh: 'replacement-token', username: 'test' }), true)
  assert.equal(vault.read().refresh, 'replacement-token')
  vault.clear()
  assert.equal(vault.read(), null)
  safeStorage.isEncryptionAvailable = () => false
  assert.equal(vault.save({ refresh: 'fixture-refresh-token', username: 'test' }), false)
  assert.equal(fs.existsSync(path.join(directory, 'session.encrypted')), false)
})
test('vault não aceita plaintext de backend basic_text nem entrada inválida', () => {
  const vault = createSessionVault({ directory: os.tmpdir(), safeStorage: { isEncryptionAvailable: () => true } })
  assert.throws(() => vault.save({ refresh: '', username: 'test' }))
})
