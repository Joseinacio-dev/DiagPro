const test = require('node:test')
const assert = require('node:assert/strict')
const { createAdbError } = require('../../adb/adbErrors')
const { createFileCollector, parseStatRecords } = require('./fileCollector')
const { createPersistenceCollector, parseActiveServices, parseOverlays, parseVpnState } = require('./persistenceCollector')

function mockAdb(routes) {
  const calls = []
  return {
    calls,
    runDevice: async (_serial, args) => {
      const key = args.slice(1).join(' ')
      calls.push(args)
      const value = routes[key]
      if (value instanceof Error) throw value
      if (typeof value === 'function') return value(args)
      return value ?? ''
    },
  }
}

test('parser de arquivos coleta metadados e rejeita traversal ou controles', () => {
  const now = Date.parse('2026-09-11T12:00:00Z')
  const output = [
    '/storage/emulated/0/Download/update.apk\t1024\t1789128000\t81a4',
    '/storage/emulated/0/DCIM/photo.jpg\t2048\t1700000000\t81a4',
    '/storage/emulated/0/../data/escape.exe\t5\t1789128000\t81a4',
    'C:\\payload.cmd\t5\t1789128000\t81a4',
  ].join('\n')
  const result = parseStatRecords(output, { roots: ['/storage/emulated/0'], nowMs: now })
  assert.equal(result.analyzed, 2)
  assert.equal(result.rejected, 2)
  assert.equal(result.items[0].evidenceStatus, 'attention')
  assert.equal(result.items[0].potentiallyDangerous, true)
  assert.equal(result.items[1].evidenceStatus, 'no_evidence')
})

test('coleta de arquivos é somente metadados e nunca usa pull ou executa conteúdo', async () => {
  const adb = mockAdb({
    'ls -1 /storage': 'emulated\nself',
    'readlink -f /storage/emulated/0': '/storage/emulated/0',
    'readlink -f /sdcard': '/storage/emulated/0',
    "find /storage/emulated/0 -type f -exec stat -c %n\t%s\t%Y\t%f {} +": '/storage/emulated/0/Download/file.ps1\t8\t1789128000\t81a4',
  })
  const result = await createFileCollector({ adb }).collectFiles('SERIAL')
  assert.equal(result.found, 1)
  assert.equal(result.analyzed, 1)
  assert.equal(result.copiedToComputer, 0)
  assert.equal(result.defender.status, 'not_needed')
  assert.equal(adb.calls.some((args) => args.includes('pull') || args.includes('exec')), false)
})

test('timeout e desconexão são tratados de forma distinta na varredura', async () => {
  const timedOutAdb = mockAdb({
    'ls -1 /storage': '',
    'readlink -f /storage/emulated/0': '/storage/emulated/0',
    'readlink -f /sdcard': '/storage/emulated/0',
    "find /storage/emulated/0 -type f -exec stat -c %n\t%s\t%Y\t%f {} +": createAdbError('ADB_TIMEOUT'),
  })
  const partial = await createFileCollector({ adb: timedOutAdb }).collectFiles('SERIAL')
  assert.equal(partial.status, 'partial')
  assert.equal(partial.files, undefined)

  const disconnectedAdb = mockAdb({ 'ls -1 /storage': createAdbError('DEVICE_DISCONNECTED') })
  await assert.rejects(createFileCollector({ adb: disconnectedAdb }).collectFiles('SERIAL'), { code: 'DEVICE_DISCONNECTED' })
})

test('diagnóstico testa /sdcard e /storage/emulated/0 mesmo quando são aliases', async () => {
  const adb = mockAdb({
    'ls -1 /storage': 'emulated\nself',
    'readlink -f /storage/emulated/0': '/storage/emulated/0',
    'readlink -f /sdcard': '/storage/emulated/0',
    "find /storage/emulated/0 -type f -exec stat -c %n\t%s\t%Y\t%f {} +": '/storage/emulated/0/DCIM/photo.jpg\t10\t1789128000\t81a4',
  })
  const result = await createFileCollector({ adb }).collectFiles('SERIAL')
  const byRoot = Object.fromEntries(result.rootDiagnostics.map((entry) => [entry.path, entry]))

  assert.equal(byRoot['/sdcard'].accessible, true)
  assert.equal(byRoot['/storage/emulated/0'].accessible, true)
  assert.equal(result.found, 1)
  assert.equal(adb.calls.filter((args) => args.includes('-exec')).length, 1, 'alias não deve ser enumerado duas vezes')
})

test('find com stat incompatível usa enumeração básica e marca coleta parcial', async () => {
  const unsupported = createAdbError('COMMAND_NOT_SUPPORTED')
  const adb = mockAdb({
    'ls -1 /storage': '',
    'readlink -f /storage/emulated/0': '/storage/emulated/0',
    'readlink -f /sdcard': '/storage/emulated/0',
    "find /storage/emulated/0 -type f -exec stat -c %n\t%s\t%Y\t%f {} +": unsupported,
    'find /storage/emulated/0 -type f -print': '/storage/emulated/0/Download/document.pdf',
  })
  const result = await createFileCollector({ adb }).collectFiles('SERIAL')

  assert.equal(result.collectionState, 'PARTIAL')
  assert.equal(result.found, 1)
  assert.equal(result.items[0].metadataAvailable, false)
  assert.equal(result.rootDiagnostics[0].method, 'find_print')
})

test('find ausente usa toybox find como fallback compatível', async () => {
  const unsupported = createAdbError('COMMAND_NOT_SUPPORTED')
  const adb = mockAdb({
    'ls -1 /storage': '',
    'readlink -f /storage/emulated/0': '/storage/emulated/0',
    'readlink -f /sdcard': '/storage/emulated/0',
    "find /storage/emulated/0 -type f -exec stat -c %n\t%s\t%Y\t%f {} +": unsupported,
    'find /storage/emulated/0 -type f -print': unsupported,
    'toybox find /storage/emulated/0 -type f -print': '/storage/emulated/0/Download/archive.zip',
  })
  const result = await createFileCollector({ adb }).collectFiles('SERIAL')

  assert.equal(result.collectionState, 'PARTIAL')
  assert.equal(result.found, 1)
  assert.equal(result.rootDiagnostics[0].method, 'toybox_find_print')
})

test('permission denied e volume inexistente não são apresentados como zero real', async () => {
  for (const failure of [
    createAdbError('COMMAND_FAILED', 'Permission denied'),
    createAdbError('COMMAND_FAILED', 'No such file or directory'),
  ]) {
    const adb = mockAdb({
      'ls -1 /storage': '',
      'test -d /storage/emulated/0': failure,
      'ls -ld /storage/emulated/0': failure,
      'test -d /sdcard': failure,
      'ls -ld /sdcard': failure,
    })
    const result = await createFileCollector({ adb }).collectFiles('SERIAL')
    assert.notEqual(result.collectionState, 'COMPLETED')
    assert.equal(result.zeroConfirmed, false)
    assert.equal(result.rootDiagnostics.every((entry) => entry.accessible === false), true)
  }
})

test('zero arquivos só é confirmado após enumeração acessível bem-sucedida', async () => {
  const adb = mockAdb({
    'ls -1 /storage': '',
    'readlink -f /storage/emulated/0': '/storage/emulated/0',
    'readlink -f /sdcard': '/storage/emulated/0',
    "find /storage/emulated/0 -type f -exec stat -c %n\t%s\t%Y\t%f {} +": '',
    'find /storage/emulated/0 -type f -print': '',
  })
  const result = await createFileCollector({ adb }).collectFiles('SERIAL')

  assert.equal(result.collectionState, 'COMPLETED')
  assert.equal(result.zeroConfirmed, true)
  assert.equal(result.found, 0)
})

test('uma raiz enumerada e outra indisponível resulta em coleta parcial', async () => {
  const unavailable = createAdbError('COMMAND_FAILED', 'Permission denied')
  const adb = mockAdb({
    'ls -1 /storage': 'ABCD-1234',
    'readlink -f /storage/emulated/0': '/storage/emulated/0',
    'readlink -f /sdcard': '/storage/emulated/0',
    'test -d /storage/ABCD-1234': unavailable,
    'ls -ld /storage/ABCD-1234': unavailable,
    "find /storage/emulated/0 -type f -exec stat -c %n\t%s\t%Y\t%f {} +": '/storage/emulated/0/a.txt\t1\t1789128000\t81a4',
  })
  const result = await createFileCollector({ adb }).collectFiles('SERIAL')

  assert.equal(result.collectionState, 'PARTIAL')
  assert.equal(result.found, 1)
})

test('falha inesperada em todas as raízes resulta em FAILED', async () => {
  const unexpected = createAdbError('COMMAND_FAILED', 'unexpected collector failure')
  const adb = mockAdb({
    'ls -1 /storage': '',
    'readlink -f /storage/emulated/0': '/storage/emulated/0',
    'readlink -f /sdcard': '/storage/emulated/0',
    "find /storage/emulated/0 -type f -exec stat -c %n\t%s\t%Y\t%f {} +": unexpected,
    'find /storage/emulated/0 -type f -print': unexpected,
    'toybox find /storage/emulated/0 -type f -print': unexpected,
  })
  const result = await createFileCollector({ adb }).collectFiles('SERIAL')

  assert.equal(result.collectionState, 'FAILED')
  assert.equal(result.zeroConfirmed, false)
})

test('parsers de persistência preservam somente observações reais', () => {
  assert.deepEqual(parseOverlays('[x] com.example.overlay\n[ ] com.example.off').value, [
    { packageName: 'com.example.overlay', enabled: true },
    { packageName: 'com.example.off', enabled: false },
  ])
  assert.equal(parseActiveServices('ServiceRecord{abc u0 com.example/.SyncService}').value[0].packageName, 'com.example')
  assert.equal(parseVpnState('NetworkAgentInfo TRANSPORT_VPN CONNECTED').active, true)
  assert.equal(parseVpnState('ordinary connectivity output').active, false)
})

test('coletor de persistência usa somente comandos read-only conhecidos', async () => {
  const adb = mockAdb({
    'cmd overlay list': '[x] com.example.overlay',
    'dumpsys activity services': 'ServiceRecord{abc u0 com.example/.SyncService}',
    'dumpsys connectivity': 'ordinary output',
  })
  const result = await createPersistenceCollector({ adb }).collect('SERIAL')
  assert.equal(result.overlays.value.length, 1)
  assert.equal(result.activeServices.value.length, 1)
  assert.equal(result.vpn.active, false)
  assert.equal(adb.calls.some((args) => /\b(rm|clear|pull|uninstall|force-stop)\b/.test(args.join(' '))), false)
})
