export const API_TIMEOUT_MS = 15000
export const DIAG_IA_TIMEOUT_MS = 25000

export function withRequestTimeout({ timeoutMs = API_TIMEOUT_MS, signal, ...options } = {}) {
  if (!Number.isFinite(timeoutMs) || timeoutMs < 1 || timeoutMs > 60000) {
    throw new TypeError('Tempo limite inválido.')
  }
  const timeout = AbortSignal.timeout(timeoutMs)
  return { ...options, signal: signal ? AbortSignal.any([signal, timeout]) : timeout }
}
