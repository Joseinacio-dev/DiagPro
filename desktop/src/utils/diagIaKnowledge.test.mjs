import assert from 'node:assert/strict'
import test from 'node:test'
import { answerDiagIaQuestion, DIAG_IA_DOMAINS, interpretDiagIaQuestion, knowledgeTopics, normalizeDiagIaText } from './diagIaKnowledge.mjs'

const context = { device: { status: 'offline', model: 'POCO', android: '16' }, scan: { status: 'partial', mode: 'Completo', findings: 2, coveragePercent: 82, unavailableModules: ['files'] } }

test('implementa todos os domínios semânticos obrigatórios', () => {
  assert.equal(knowledgeTopics().length, 28)
  for (const domain of Object.values(DIAG_IA_DOMAINS)) assert.ok(knowledgeTopics().includes(domain), domain)
})

test('normalização remove acentos, pontuação e expande abreviações e erros conhecidos', () => {
  assert.equal(normalizeDiagIaText('Minha LICENÇA tá ativa?!'), 'minha licenca esta ativa')
  assert.equal(normalizeDiagIaText('pq o scaner não vai'), 'porque o scanner nao vai')
  assert.equal(normalizeDiagIaText('conecao do dispostivo'), 'conexao do dispositivo')
})

test('variações de plano são classificadas no domínio específico', () => {
  for (const question of ['como eu vejo sobre o meu plano', 'qual meu plano', 'minha licenca ta ativa', 'onde vejo minha assinatura', 'quando vence']) {
    const result = answerDiagIaQuestion(question, context)
    assert.equal(result.domain, DIAG_IA_DOMAINS.PLAN, question)
    assert.notEqual(result.confidence, 'low', question)
    assert.match(result.message, /Sistema > Plano e assinatura/, question)
  }
})

test('plano usa dado real quando disponível e nunca inventa quando ausente', () => {
  const known = answerDiagIaQuestion('qual meu plano?', { ...context, license: { plan: 'Profissional', status: 'ativa', expiresAt: '31/12/2026' } })
  const unknown = answerDiagIaQuestion('qual meu plano?', context)
  assert.match(known.message, /Profissional.*ativa.*31\/12\/2026/)
  assert.match(unknown.message, /não consigo afirmar qual é seu plano/i)
})

test('variações de ADB vencem o domínio genérico de dispositivo', () => {
  for (const question of ['meu celular nao aparece', 'adb nao reconhece', 'ta offline']) {
    assert.equal(answerDiagIaQuestion(question, context).domain, DIAG_IA_DOMAINS.ADB, question)
  }
})

test('variações de scan parcial usam contexto dos módulos limitados', () => {
  for (const question of ['pq ficou parcial', 'nao analisou tudo', 'o completo ficou limitado']) {
    const result = answerDiagIaQuestion(question, context)
    assert.equal(result.domain, DIAG_IA_DOMAINS.PARTIAL, question)
    assert.match(result.message, /files/, question)
  }
})

test('finding é diferenciado de ameaça mesmo quando a pergunta menciona vírus', () => {
  for (const question of ['oq significa finding', 'esse achado e virus']) {
    const result = answerDiagIaQuestion(question, context)
    assert.equal(result.domain, DIAG_IA_DOMAINS.FINDING, question)
    assert.match(result.message, /não significa automaticamente vírus/i)
  }
})

test('suporte humano e chamado possuem roteamento próprio', () => {
  assert.equal(answerDiagIaQuestion('quero falar com uma pessoa', context).domain, DIAG_IA_DOMAINS.SUPPORT)
  assert.equal(answerDiagIaQuestion('abre um chamado', context).domain, DIAG_IA_DOMAINS.TICKET)
  assert.equal(answerDiagIaQuestion('quero suporte', context).domain, DIAG_IA_DOMAINS.SUPPORT)
})

test('erros simples são tolerados sem correspondência ampla insegura', () => {
  assert.equal(answerDiagIaQuestion('licenssa', context).domain, DIAG_IA_DOMAINS.PLAN)
  assert.equal(answerDiagIaQuestion('scaner', context).domain, DIAG_IA_DOMAINS.RESULT)
  assert.equal(answerDiagIaQuestion('conecao', context).domain, DIAG_IA_DOMAINS.ADB)
})

test('follow-up curto herda o domínio anterior', () => {
  const first = interpretDiagIaQuestion('qual meu plano')
  const followUp = answerDiagIaQuestion('e quando vence?', context, { previousDomain: first.domain })
  assert.equal(first.domain, DIAG_IA_DOMAINS.PLAN)
  assert.equal(followUp.domain, DIAG_IA_DOMAINS.PLAN)
})

test('pergunta ambígua pede esclarecimento em vez de responder assunto errado', () => {
  const result = answerDiagIaQuestion('como eu vejo isso?', context)
  assert.equal(result.domain, null)
  assert.equal(result.confidence, 'low')
  assert.match(result.message, /Não entendi exatamente/)
})

test('conhece a navegação real das telas', () => {
  assert.match(answerDiagIaQuestion('onde vejo relatorios?', context).message, /Gestão > Relatórios/)
  assert.match(answerDiagIaQuestion('onde ficam as configuracoes?', context).message, /Sistema > Configurações/)
  assert.match(answerDiagIaQuestion('onde vejo meu dispositivo?', context).message, /Principal > Dispositivos/)
  assert.match(answerDiagIaQuestion('onde vejo uma ameaca?', context).message, /Principal > Ameaças/)
})
