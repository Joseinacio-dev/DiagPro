import { joinApiUrl } from '../config/apiBase.mjs'

function wait(milliseconds, signal) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, milliseconds)
    signal?.addEventListener('abort', () => {
      clearTimeout(timer)
      reject(signal.reason || new DOMException('Aborted', 'AbortError'))
    }, { once: true })
  })
}

export async function checkApiHealth({
  apiBaseUrl,
  fetchImpl = fetch,
  attempts = 3,
  timeoutMs = 25000,
  retryDelayMs = 2500,
  waitImpl = wait,
  signal = null,
} = {}) {
  const url = joinApiUrl(apiBaseUrl, '/health/')
  let lastError = null

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(new DOMException('Timeout', 'TimeoutError')), timeoutMs)
    const abortFromCaller = () => controller.abort(signal.reason)
    signal?.addEventListener('abort', abortFromCaller, { once: true })
    try {
      const response = await fetchImpl(url, { method: 'GET', cache: 'no-store', signal: controller.signal })
      const body = response.ok ? await response.json().catch(() => null) : null
      if (response.ok && body?.status === 'ok') return { status: 'online', attempts: attempt }
      lastError = new Error(`HTTP_${response.status}`)
    } catch (error) {
      if (signal?.aborted) throw signal.reason || error
      lastError = error
    } finally {
      clearTimeout(timer)
      signal?.removeEventListener('abort', abortFromCaller)
    }
    if (attempt < attempts) await waitImpl(retryDelayMs, signal)
  }

  return { status: 'offline', attempts, code: lastError?.name === 'TimeoutError' ? 'TIMEOUT' : 'UNAVAILABLE' }
}
