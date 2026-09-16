const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const vm = require('node:vm')

test('preload carrega no sandbox e delega a criação do scanId ao processo principal', async () => {
  const exposed = {}
  const calls = []
  const electron = {
    contextBridge: {
      exposeInMainWorld: (name, api) => { exposed[name] = api },
    },
    ipcRenderer: {
      invoke: async (...args) => {
        calls.push(args)
        return args[0] === 'create-scan-id' ? '00000000-0000-4000-8000-000000000001' : null
      },
      on: () => {},
      removeListener: () => {},
    },
  }
  const sandboxRequire = (moduleName) => {
    if (moduleName === 'electron') return electron
    throw new Error(`module not available in sandbox: ${moduleName}`)
  }
  const source = fs.readFileSync(path.join(__dirname, 'preload.js'), 'utf8')

  vm.runInNewContext(source, { require: sandboxRequire, TypeError })

  assert.equal(typeof exposed.diagpro?.inspectQuickAction, 'function')
  await exposed.diagpro.inspectQuickAction({ serial: 'DEVICE-TEST', action: 'cleanup', operationId: 'operation-test', command: 'rm' })
  assert.equal(calls[0][1].action, 'cleanup')
  assert.equal(calls[0][1].command, undefined)
  assert.equal(calls[0][1].operationId, 'operation-test')
  assert.equal(typeof exposed.diagpro?.cancelQuickAction, 'function')
  assert.equal(typeof exposed.diagpro?.getDeviceStatus, 'function')
  assert.equal(typeof exposed.diagpro?.getAppInfo, 'function')
  assert.equal(typeof exposed.diagpro?.getStartupSettings, 'function')
  assert.equal(typeof exposed.diagpro?.setStartupSettings, 'function')
  assert.equal(typeof exposed.diagpro?.exportSupportDiagnostic, 'function')
  assert.equal(typeof exposed.diagpro?.reportClientEvent, 'function')
  assert.equal(typeof exposed.diagpro?.selectDevice, 'function')
  assert.equal(typeof exposed.diagpro?.createScanId, 'function')
  assert.equal(typeof exposed.diagpro?.startGoogleAuth, 'function')
  assert.equal(typeof exposed.diagpro?.cancelGoogleAuth, 'function')
  assert.equal(await exposed.diagpro.createScanId(), '00000000-0000-4000-8000-000000000001')
  const firstAppsRequest = exposed.diagpro.getInstalledApps({ serial: 'DEVICE-TEST' })
  const duplicateAppsRequest = exposed.diagpro.getInstalledApps({ serial: 'DEVICE-TEST' })
  assert.equal(firstAppsRequest, duplicateAppsRequest)
  await firstAppsRequest
  await exposed.diagpro.getInstalledApps({ serial: 'DEVICE-TEST' })
  await exposed.diagpro.startGoogleAuth({ apiBaseUrl: 'https://api.example.test' })
  await exposed.diagpro.cancelGoogleAuth()
  await exposed.diagpro.selectDevice('DEVICE-TEST')
  await exposed.diagpro.getAppInfo()
  await exposed.diagpro.getStartupSettings()
  await exposed.diagpro.setStartupSettings({ enabled: true, command: 'malicious' })
  await exposed.diagpro.exportSupportDiagnostic({ api: { status: 'online' }, password: 'not-forwarded-by-sanitizer' })
  await exposed.diagpro.reportClientEvent({ event: 'diagnostic_persistence_failed', code: 'HTTP_400', details: 'private' })
  assert.deepEqual(calls.map(([channel, payload]) => [channel, payload?.serial || null]), [
    ['inspect-quick-action', 'DEVICE-TEST'],
    ['create-scan-id', null],
    ['get-installed-apps', 'DEVICE-TEST'],
    ['get-installed-apps', 'DEVICE-TEST'],
    ['google-auth-start', null],
    ['google-auth-cancel', null],
    ['select-device', 'DEVICE-TEST'],
    ['get-app-info', null],
    ['get-startup-settings', null],
    ['set-startup-settings', null],
    ['export-support-diagnostic', null],
    ['client-event', null],
  ])
  assert.equal(calls.at(-3)[1].enabled, true)
  assert.equal(Object.keys(calls.at(-3)[1]).length, 1)
  assert.equal(calls.at(-1)[1].event, 'diagnostic_persistence_failed')
  assert.equal(calls.at(-1)[1].code, 'HTTP_400')
  assert.equal(Object.keys(calls.at(-1)[1]).length, 2)
})
