import { localDiagIaAnswer } from '../utils/supportContext.mjs'
import { answerDiagIaQuestion } from '../utils/diagIaKnowledge.mjs'
import { DIAG_IA_TIMEOUT_MS } from '../utils/requestTimeout.mjs'

// Ponto único para respostas da Diag IA. Quando houver serviço real, o provider
// será uma chamada autenticada ao backend DiagPro; nunca diretamente a um provedor externo.
export async function requestDiagIaGuidance({ actionId, question, history = [], context, previousDomain = null, backendProvider = null, timeoutMs = DIAG_IA_TIMEOUT_MS }) {
  if (question && typeof backendProvider === 'function') {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort('timeout'), timeoutMs)
    try {
      return await backendProvider({ message: question, history: history.slice(-8), context, signal: controller.signal })
    } catch (error) {
      const local = answerDiagIaQuestion(question, context, { previousDomain })
      const reason = error?.status === 429 ? 'Limite temporário de perguntas atingido.' : 'A Diag IA online está temporariamente indisponível.'
      return { source: 'local_fallback', fallbackReason: error?.status || (controller.signal.aborted ? 'timeout' : 'network'), ...local, escalate: local.confidence === 'low', message: `${reason} Vou tentar ajudar usando minha base local.\n\n${local.message}` }
    } finally {
      clearTimeout(timer)
    }
  }
  if (question) return { source: 'local_knowledge', ...answerDiagIaQuestion(question, context, { previousDomain }) }
  return { source: 'local_documentation', confidence: 'high', escalate: actionId === 'support', message: localDiagIaAnswer(actionId, context) }
}
