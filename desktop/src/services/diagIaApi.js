import { apiUrl } from '../config/api.js'
import { fetchAutenticado } from '../utils/auth.js'
import { buildOnlineDiagIaContext } from './diagIaPayload.mjs'
import { DIAG_IA_TIMEOUT_MS } from '../utils/requestTimeout.mjs'

const DIAG_IA_URL = apiUrl('/api/diag-ia/chat/')
export async function requestOnlineDiagIa({ message, history, context, signal }) {
  const response = await fetchAutenticado(DIAG_IA_URL, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, signal, timeoutMs: DIAG_IA_TIMEOUT_MS,
    body: JSON.stringify({ message, history: history.slice(-8), context }),
  })
  let data = null
  try { data = await response.json() } catch { /* resposta inválida tratada abaixo */ }
  if (!response.ok) {
    const error = new Error('Diag IA online indisponível')
    error.status = response.status
    error.code = data?.code || `HTTP_${response.status}`
    throw error
  }
  if (typeof data?.message !== 'string' || !data.message.trim()) throw new Error('Resposta inválida da Diag IA')
  return { ...data, message: data.message.trim() }
}

export { buildOnlineDiagIaContext }
