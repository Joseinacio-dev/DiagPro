import assert from 'node:assert/strict'
import test from 'node:test'
import { requestDiagIaGuidance } from './diagIa.mjs'

test('Diag IA usa documentação local sem fazer chamada externa', async () => {
  const result = await requestDiagIaGuidance({ actionId: 'connect', context: {} })
  assert.equal(result.source, 'local_documentation')
  assert.match(result.message, /cabo USB de dados/)
})

test('arquitetura aceita somente provider explícito para futuro backend DiagPro', async () => {
  let received = null
  const result = await requestDiagIaGuidance({
    question: 'problema adb', context: { device: { status: 'offline' } },
    backendProvider: async (payload) => { received = payload; return { source: 'diagpro_backend', message: 'Resposta segura' } },
  })
  assert.equal(received.message, 'problema adb')
  assert.equal(result.source, 'diagpro_backend')
})

test('resposta online do backend é exibida e recebe somente as oito mensagens mais recentes', async () => {
  let received = null
  const history = Array.from({ length: 12 }, (_, index) => ({ role: index % 2 ? 'assistant' : 'user', content: `m${index}` }))
  const result = await requestDiagIaGuidance({
    question: 'como verifico a bateria?', history, context: { batteryLevel: 80 },
    backendProvider: async (payload) => { received = payload; return { source: 'gemini', message: 'Resposta da IA', escalate: false } },
  })
  assert.equal(result.message, 'Resposta da IA')
  assert.equal(received.history.length, 8)
  assert.equal(received.history[0].content, 'm4')
})

for (const status of [401, 500]) {
  test(`falha HTTP ${status} usa fallback local sem perder a orientação`, async () => {
    const result = await requestDiagIaGuidance({
      question: 'como funciona o scanner completo?', context: {},
      backendProvider: async () => { throw Object.assign(new Error('falha'), { status }) },
    })
    assert.equal(result.source, 'local_fallback')
    assert.match(result.message, /temporariamente indisponível/)
    assert.match(result.message, /Scanner Completo/)
  })
}

test('limite HTTP 429 informa indisponibilidade temporária e usa fallback local', async () => {
  const result = await requestDiagIaGuidance({
    question: 'como conectar o celular?', context: {},
    backendProvider: async () => { throw Object.assign(new Error('limite'), { status: 429 }) },
  })
  assert.equal(result.source, 'local_fallback')
  assert.equal(result.fallbackReason, 429)
  assert.match(result.message, /Limite temporário de perguntas atingido/)
})

test('timeout cancela a chamada online e preserva o fallback local', async () => {
  const result = await requestDiagIaGuidance({
    question: 'como conectar o celular?', context: {}, timeoutMs: 5,
    backendProvider: ({ signal }) => new Promise((resolve, reject) => {
      signal.addEventListener('abort', () => reject(new Error('abortado')), { once: true })
    }),
  })
  assert.equal(result.source, 'local_fallback')
  assert.equal(result.fallbackReason, 'timeout')
  assert.match(result.message, /base local/)
})

test('pergunta livre usa base local e sinaliza escalonamento quando confiança é baixa', async () => {
  const known = await requestDiagIaGuidance({ question: 'como funciona o scanner completo?', context: {} })
  const unknown = await requestDiagIaGuidance({ question: 'qual é a previsão do tempo em Marte?', context: {} })
  assert.equal(known.source, 'local_knowledge')
  assert.match(known.message, /Scanner Completo/)
  assert.equal(unknown.confidence, 'low')
  assert.match(unknown.message, /Não entendi exatamente/)
})

test('serviço encaminha domínio anterior para interpretar follow-up', async () => {
  const first = await requestDiagIaGuidance({ question: 'qual meu plano?', context: {} })
  const followUp = await requestDiagIaGuidance({ question: 'e quando vence?', context: {}, previousDomain: first.domain })
  assert.equal(followUp.domain, first.domain)
  assert.match(followUp.message, /Plano e assinatura/)
})
