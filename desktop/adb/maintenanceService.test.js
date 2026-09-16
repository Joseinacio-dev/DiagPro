const test = require('node:test')
const assert = require('node:assert/strict')
const { createMaintenanceService, batteryFields, numericField } = require('./maintenanceService')

function fixture(overrides = {}) {
  const calls = []
  const outputs = {
    'devices -l': 'List of devices attached\nSERIAL device model:Test',
    'df -k /data': 'Filesystem 1K-blocks Used Available Use% Mounted on\n/dev/block/data 10000000 6000000 4000000 60% /data',
    'dumpsys diskstats': 'App Cache Size: 1024',
    'pm help': ' trim-caches DESIRED_FREE_SPACE [internal|UUID]',
    'cat /proc/meminfo': 'MemTotal: 4000000 kB\nMemAvailable: 2000000 kB',
    'dumpsys cpuinfo': ' 12% TOTAL: 8% user + 4% kernel',
    'dumpsys battery': 'AC powered: false\nUSB powered: true\nWireless powered: false\nlevel: 73\nscale: 100\nstatus: 3\nhealth: 2\npresent: true\ntemperature: 315\nvoltage: 4100\ntechnology: Li-poly\nCharge counter: 2300000\ncurrent_now: -420000',
    'dumpsys batterystats --charged': 'Time on battery: 1h 2m realtime\nScreen on: 20m',
    'getprop ro.build.version.sdk': '35',
    version: 'Android Debug Bridge version 1.0.41',
    help: ' pull [-a] remote local\n backup [-f file]',
    ...overrides,
  }
  async function run(args) {
    calls.push(args)
    const key = args.join(' ')
    const value = outputs[key]
    if (value instanceof Error) throw value
    if (typeof value === 'function') return value()
    if (value === undefined) throw new Error(`Unexpected command: ${key}`)
    return value
  }
  return { calls, service: createMaintenanceService({ adb: {
    run,
    runDevice: (serial, args) => { assert.equal(serial, 'SERIAL'); assert.equal(args[0], 'shell'); return run(args.slice(1)) },
  }, now: () => '2026-09-11T12:00:00Z' }) }
}

test('battery requires real scale and preserves missing values', () => {
  assert.deepEqual(batteryFields('UPDATES STOPPED -- use reset to restart\nlevel: 100\nscale: 100'), [['Leitura física', null]])
  assert.equal(batteryFields('garbage').every(([, value]) => value === null), true)
  assert.equal(batteryFields('level: 50')[0][1], null)
  assert.equal(batteryFields('level: 100\nscale: 200')[0][1], '50%')
  assert.equal(batteryFields('level: 101\nscale: 100')[0][1], null)
  assert.equal(batteryFields('temperature: 0')[8][1], '0 °C')
  assert.equal(numericField('App Cache Size: -1', 'App Cache Size'), null)
  assert.equal(numericField('App Cache Size: 0', 'App Cache Size'), 0)
  assert.equal(numericField('App Cache Size: 123 junk', 'App Cache Size'), null)
})

test('cleanup preview reports evidence without claiming reclaimable space or enabling deletion', async () => {
  const { service, calls } = fixture()
  const result = await service.inspect({ serial: 'SERIAL', action: 'cleanup' })
  assert.equal(result.sections[1].fields[0].value, '1024 bytes')
  assert.deepEqual(result.candidates, [])
  assert.equal(result.canExecute, false)
  assert.equal(result.coverage, 'partial')
  assert.deepEqual(calls.map(args => args.join(' ')), ['devices -l', 'df -k /data', 'dumpsys diskstats', 'pm help', 'devices -l'])
})

test('cleanup ignores injected deletion, path and confirmation inputs', async () => {
  const { service, calls } = fixture()
  const result = await service.inspect({
    serial: 'SERIAL', action: 'cleanup', confirmed: true, path: '/sdcard/DCIM', command: 'rm',
  })
  assert.equal(result.canExecute, false)
  assert.deepEqual(result.candidates, [])
  assert.equal(calls.some(args => /rm|DCIM|pm clear/.test(args.join(' '))), false)
})

test('permission denial with zero exit status is unavailable, not data', async () => {
  const { service } = fixture({ 'dumpsys diskstats': 'Permission Denial: App Cache Size: 9999' })
  const result = await service.inspect({ serial: 'SERIAL', action: 'cleanup' })
  assert.equal(result.sections[1].status, 'unavailable')
  assert.deepEqual(result.sections[1].fields, [])
})

test('empty, unsupported and timed out collectors keep partial results', async () => {
  const { service } = fixture({ 'dumpsys battery': Object.assign(new Error(), { code: 'ADB_TIMEOUT' }) })
  const result = await service.inspect({ serial: 'SERIAL', action: 'battery' })
  assert.equal(result.coverage, 'unavailable')
  assert.match(result.sections[0].reason, /Tempo limite/)
})

test('battery collects only current readings without usage history or reset', async () => {
  const { service } = fixture()
  const result = await service.inspect({ serial: 'SERIAL', action: 'battery' })
  assert.equal(result.sections[0].fields[0].value, '73%')
  assert.equal(result.sections[0].fields.find(field => field.name === 'Fonte de alimentação').value, 'USB')
  assert.equal(result.sections[0].fields.find(field => field.name === 'Temperatura').value, '31.5 °C')
  assert.equal(result.sections[0].fields.find(field => field.name === 'Tecnologia').value, 'Li-poly')
  assert.equal(result.sections[0].fields.find(field => field.name === 'Corrente atual').value, '-420000 µA')
  assert.equal(result.sections[0].fields.find(field => field.name === 'Contador de carga').value, '2300000 µAh')
  assert.equal(result.sections.length, 5)
  assert.equal(result.sections[1].status, 'unavailable')
})

test('battery never invents unavailable electrical readings', () => {
  const fields = new Map(batteryFields('level: 50\nscale: 100\nstatus: 4'))
  assert.equal(fields.get('Fonte de alimentação'), null)
  assert.equal(fields.get('Tecnologia'), null)
  assert.equal(fields.get('Corrente atual'), null)
  assert.equal(fields.get('Contador de carga'), null)
})

test('optimization does not infer available memory from MemFree', async () => {
  const { service } = fixture({ 'cat /proc/meminfo': 'MemTotal: 4000000 kB\nMemFree: 10000 kB' })
  const result = await service.inspect({ serial: 'SERIAL', action: 'optimization' })
  assert.equal(result.sections[1].fields[1].value, null)
  assert.equal(result.sections[1].status, 'partial')
  assert.equal(result.sections[2].fields[0].value, '12% TOTAL: 8% user + 4% kernel')
})

test('backup command presence never enables backup execution', async () => {
  const { service } = fixture({ 'getprop ro.build.version.sdk': '36' })
  const result = await service.inspect({ serial: 'SERIAL', action: 'backup' })
  assert.equal(result.sections[0].fields[0].value, 36)
  assert.equal(result.canExecute, false)
  assert.match(result.sections[2].fields[1].value, /não validadas/)
  assert.match(result.notes.join(' '), /Nenhum backup foi criado/)
})

test('only known read commands can be reached for all actions', async () => {
  const { service, calls } = fixture()
  for (const action of ['cleanup', 'optimization', 'battery', 'backup']) await service.inspect({ serial: 'SERIAL', action })
  assert.equal(calls.some(args => /\b(rm|clear|uninstall|reset|restore|reboot|trim-caches|force-stop)\b/.test(args.join(' '))), false)
  assert.equal(calls.some(args => args[0] === 'backup' || args[0] === 'pull'), false)
})

test('invalid serial or unknown action never calls ADB', async () => {
  const { service, calls } = fixture()
  await assert.rejects(service.inspect({ serial: 'SERIAL;rm', action: 'cleanup' }), { code: 'INVALID_DEVICE' })
  await assert.rejects(service.inspect({ serial: 'SERIAL', action: 'delete' }), { code: 'INVALID_ARGUMENTS' })
  assert.deepEqual(calls, [])
})

for (const [state, code] of [['unauthorized', 'DEVICE_UNAUTHORIZED'], ['offline', 'DEVICE_OFFLINE'], ['', 'DEVICE_DISCONNECTED']]) {
  test(`rejects ${state || 'missing'} device before querying`, async () => {
    const { service, calls } = fixture({ 'devices -l': state ? `SERIAL ${state}` : '' })
    await assert.rejects(service.inspect({ serial: 'SERIAL', action: 'battery' }), { code })
    assert.equal(calls.length, 1)
  })
}

test('disconnection during collection rejects the entire snapshot', async () => {
  const { service } = fixture({ 'dumpsys battery': Object.assign(new Error(), { code: 'DEVICE_DISCONNECTED' }) })
  await assert.rejects(service.inspect({ serial: 'SERIAL', action: 'battery' }), { code: 'DEVICE_DISCONNECTED' })
})

test('final device revalidation prevents delivery after device replacement', async () => {
  let checks = 0
  const { service } = fixture({ 'devices -l': () => ++checks === 1 ? 'SERIAL device' : 'OTHER device' })
  await assert.rejects(service.inspect({ serial: 'SERIAL', action: 'cleanup' }), { code: 'DEVICE_DISCONNECTED' })
})

test('aborted request does not touch ADB', async () => {
  const { service, calls } = fixture()
  const controller = new AbortController()
  controller.abort(Object.assign(new Error(), { code: 'OPERATION_CANCELED' }))
  await assert.rejects(service.inspect({ serial: 'SERIAL', action: 'cleanup', signal: controller.signal }), { code: 'OPERATION_CANCELED' })
  assert.equal(calls.length, 0)
})
