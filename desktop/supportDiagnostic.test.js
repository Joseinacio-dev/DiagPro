const assert = require('node:assert/strict')
const test = require('node:test')
const { buildSupportDiagnostic, sanitizeSupportPayload } = require('./supportDiagnostic')

test('diagnóstico de suporte mantém apenas campos técnicos permitidos', () => {
  const result = buildSupportDiagnostic({
    payload: {
      api: { status: 'online', url: 'rediss://secret' },
      adb: { status: 'connected', available: true, version: '37.0.1', executable: 'C:\\private\\adb.exe' },
      device: { status: 'connected', manufacturer: 'Xiaomi', model: 'POCO', android: '16', serial: 'SECRET-SERIAL' },
      scan: { status: 'partial', mode: 'complete', findings: 2, coveragePercent: 80, unavailableModules: ['files'] },
      access: 'jwt-secret', refresh: 'refresh-secret', password: 'password-secret',
    },
    runtime: { version: '0.1.0-beta.1', platform: 'win32', osVersion: '11', architecture: 'x64', packaged: true },
    logs: [{ timestamp: '2026-09-12T10:00:00Z', level: 'error', event: 'adb_error', code: 'ADB_TIMEOUT', token: 'secret' }],
  })
  const serialized = JSON.stringify(result)
  for (const forbidden of ['SECRET-SERIAL', 'rediss://', 'private\\\\adb', 'jwt-secret', 'refresh-secret', 'password-secret', '"token":']) {
    assert.equal(serialized.includes(forbidden), false)
  }
  assert.equal(result.application.version, '0.1.0-beta.1')
  assert.equal(result.device.model, 'POCO')
  assert.equal(result.recentLogs[0].code, 'ADB_TIMEOUT')
})

test('payload inválido recebe estados seguros e limites numéricos', () => {
  const result = sanitizeSupportPayload({ device: { status: 'made-up' }, scan: { findings: -5, coveragePercent: 999 } })
  assert.equal(result.device.status, 'unavailable')
  assert.equal(result.scan.findings, 0)
  assert.equal(result.scan.coveragePercent, 100)
})
