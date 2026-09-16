const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const config = require('./electron-builder.cjs')
const pkg = require('./package.json')

test('versão beta possui uma única fonte de verdade no package.json', () => {
  assert.equal(pkg.version, '0.1.0-beta.1')
  assert.equal(config.productName, 'DiagPro')
  assert.match(config.artifactName, /^DiagPro-Setup-/)
  assert.equal(fs.existsSync(path.join(__dirname, 'resources', 'diagpro.ico')), true)
})

test('pacote Windows é x64, por usuário e sem elevação administrativa', () => {
  assert.deepEqual(config.win.target, [{ target: 'nsis', arch: ['x64'] }])
  assert.equal(config.win.requestedExecutionLevel, 'asInvoker')
  assert.equal(config.nsis.perMachine, false)
  assert.equal(config.nsis.createStartMenuShortcut, true)
})

test('ADB mínimo e metadados de origem são exigidos fora do ASAR', () => {
  const required = ['adb.exe', 'AdbWinApi.dll', 'AdbWinUsbApi.dll', 'NOTICE.txt', 'source.properties', 'MANIFEST.json']
  assert.deepEqual(config.extraResources[0].filter, required)
  for (const file of required) {
    assert.equal(fs.existsSync(path.join(__dirname, 'resources', 'platform-tools', file)), true, `${file} ausente`)
  }
})

test('arquivos de desenvolvimento e segredos são excluídos do app', () => {
  assert.equal(config.files.includes('appLifecycle.js'), true)
  assert.equal(config.files.includes('supportDiagnostic.js'), true)
  assert.equal(config.files.includes('!**/*.test.*'), true)
  assert.equal(config.files.includes('!node_modules/**'), true)
  assert.equal(config.files.includes('!**/.env*'), true)
  assert.equal(config.files.includes('!**/fixtures/**'), true)
  assert.equal(config.files.includes('!**/*.log'), true)
})
