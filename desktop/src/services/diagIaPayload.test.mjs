import assert from 'node:assert/strict'
import test from 'node:test'
import { buildOnlineDiagIaContext } from './diagIaPayload.mjs'

test('contexto online contém somente campos técnicos permitidos', () => {
  const context = buildOnlineDiagIaContext({
    device: { status: 'authorized', manufacturer: 'Samsung', model: 'SM-A356E', android: '16', serial: 'SECRET' },
    scan: { status: 'completed', mode: 'Completo', findings: 0, riskScore: 0, coverageStatus: 'limited', moduleStatuses: { files: 'partial', password: 'SECRET' }, appsFound: 516, filesAnalyzed: 0, limitations: ['Scoped storage'], token: 'SECRET' },
  }, { api: { status: 'online', url: 'SECRET' }, appInfo: { version: '0.1.0-beta.1' } })
  assert.equal(context.deviceConnected, true)
  assert.equal(context.model, 'SM-A356E')
  assert.equal(context.appsFound, 516)
  assert.deepEqual(context.moduleStatuses, { files: 'partial' })
  const serialized = JSON.stringify(context)
  assert.equal(serialized.includes('SECRET'), false)
  assert.equal(serialized.includes('serial'), false)
  assert.equal(serialized.includes('token'), false)
})
