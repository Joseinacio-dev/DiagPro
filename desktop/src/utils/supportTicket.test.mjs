import assert from 'node:assert/strict'
import test from 'node:test'
import { buildSupportTicket, ticketSummary } from './supportTicket.mjs'

test('chamado reúne contexto necessário e indica suporte humano em breve', () => {
  const ticket = buildSupportTicket({ question: 'Scanner falhou', answer: 'Tente novamente', version: '2.1.0', profile: 'Conta comum', apiStatus: 'online', context: { device: { status: 'offline', manufacturer: 'Xiaomi', model: 'POCO', android: '16' }, scan: { status: 'failed', mode: 'Completo', findings: 1, unavailableModules: ['files'] } }, now: new Date('2026-09-13T10:00:00Z') })
  assert.equal(ticket.status, 'support_human_coming_soon')
  assert.equal(ticket.scan.unavailableModules[0], 'files')
  assert.match(ticketSummary(ticket), /Scanner falhou/)
})

test('exportação sanitiza segredos, URLs, serial, caminhos e conteúdo privado', () => {
  const ticket = buildSupportTicket({ question: 'token=abc https://internal.test', answer: 'senha=123', context: { device: { serial: 'SECRET-SERIAL', model: 'POCO' }, scan: { path: '/private/file', content: 'private', status: 'failed' } }, logs: [{ event: 'x', authorization: 'Bearer abc', databaseUrl: 'secret' }] })
  const exported = JSON.stringify(ticket)
  for (const forbidden of ['abc', '123', 'internal.test', 'SECRET-SERIAL', '/private/file', 'Bearer abc', 'databaseUrl']) assert.equal(exported.includes(forbidden), false)
  assert.equal(ticket.device.model, 'POCO')
})
