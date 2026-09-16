import assert from 'node:assert/strict'
import test from 'node:test'
import { buildSupportContext, localDiagIaAnswer, settingsTabsForProfile } from './supportContext.mjs'

test('contexto sem dispositivo não inventa dados', () => {
  const context = buildSupportContext()
  assert.equal(context.device.status, 'waiting')
  assert.equal(context.device.model, null)
  assert.equal(context.scan.status, 'idle')
  assert.equal(context.scan.findings, 0)
})

test('contexto usa dispositivo e último scan reais sem serial ou segredo', () => {
  const context = buildSupportContext({
    device: { status: 'connected', manufacturer: 'Xiaomi', model: 'POCO', androidVersion: '16', serial: 'DO-NOT-EXPORT' },
    scanSession: { status: 'partial', mode: 'complete', result: { security: { findings: [{ id: 1 }] }, technicalCoverage: { percent: 82, status: 'limited' }, stages: { apps: { status: 'completed' }, files: { status: 'unavailable' } } } },
  })
  assert.equal(context.device.model, 'POCO')
  assert.equal(context.scan.findings, 1)
  assert.deepEqual(context.scan.unavailableModules, ['files'])
  assert.equal(JSON.stringify(context).includes('DO-NOT-EXPORT'), false)
})

test('usuário comum não vê administração e staff vê', () => {
  assert.deepEqual(settingsTabsForProfile({ is_staff: false }), ['general', 'device', 'support', 'about'])
  assert.deepEqual(settingsTabsForProfile({ is_staff: true }), ['general', 'device', 'support', 'about', 'admin'])
})

test('respostas locais orientam sem executar ou afirmar ameaça', () => {
  const answer = localDiagIaAnswer('finding', buildSupportContext())
  assert.match(answer, /não significa automaticamente ameaça/i)
  assert.equal(answer.includes('uninstall'), false)
})
