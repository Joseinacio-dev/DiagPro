const test = require('node:test')
const assert = require('node:assert/strict')
const {
  classifyAndroidFile,
  safeAndroidPath,
  safeLocalLeafName,
  safeQuarantineName,
} = require('./androidContentSafety')

test('rejeita traversal, caminhos Windows, controles e raiz inesperada', () => {
  for (const value of [
    '../payload.exe', '/sdcard/../data/payload', '..\\payload.exe',
    'C:\\payload.exe', '/data/data/app/secret', '/sdcard/name\nnext.exe',
  ]) assert.equal(safeAndroidPath(value), false, value)
  assert.equal(safeAndroidPath('/storage/emulated/0/Download/a file.apk'), true)
})

test('classifica extensão perigosa como atenção sem afirmar malware', () => {
  assert.deepEqual(classifyAndroidFile('/sdcard/Download/update.APK'), {
    extension: '.apk', type: 'executable_or_script', potentiallyDangerous: true,
  })
  assert.equal(classifyAndroidFile('/sdcard/DCIM/photo.jpg').potentiallyDangerous, false)
})

test('nome de quarentena independe do nome vindo do telefone', () => {
  assert.equal(safeQuarantineName('session-12345678', 7), 'session-12345678-000007.bin')
  assert.equal(safeLocalLeafName('CON.exe'), false)
  assert.equal(safeLocalLeafName('..'), false)
  assert.equal(safeLocalLeafName('safe-0001.bin'), true)
})
