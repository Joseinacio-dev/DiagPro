const test = require('node:test')
const assert = require('node:assert/strict')
const { createAndroidBatteryProvider, createIOSBatteryProvider } = require('./deviceProviders')
test('provider Android delega somente leitura e provider iOS é honesto', async () => {
  let args
  const android = createAndroidBatteryProvider({ collect: async (...received) => { args = received; return { status: 'available' } } })
  assert.equal((await android.inspect()).status, 'available')
  assert.deepEqual(args, ['Bateria atual', ['dumpsys', 'battery']])
  const ios = createIOSBatteryProvider()
  assert.equal(ios.status, 'not_implemented')
  assert.equal((await ios.inspect()).status, 'unavailable')
})
