import { apiUrl } from '../config/api.js'
import { withRequestTimeout } from './requestTimeout.mjs'

import { createSessionStore } from './sessionStore.mjs'
const session = createSessionStore({ storage: localStorage, bridge: window.diagpro })
let refreshPending = null

export async function fetchApi(url, options = {}) {
  try {
    return await fetch(url, withRequestTimeout(options))
  } catch (error) {
    window.diagpro?.reportClientEvent?.({ event: 'api_unavailable' })?.catch(() => {})
    throw error
  }
}

export function salvarTokens(access, refresh, username = '', remember = true) {
  return session.save(access, refresh, username, remember)
}

export function limparTokens() {
  return session.clear()
}

export function getRefreshToken() {
  return session.read().refresh
}

export function getAccessToken() {
  return session.read().access
}
export const getSessionUsername = () => session.read().username
export const restaurarSessaoSalva = () => session.restore()

export async function renovarSessao() {
  if (refreshPending) return refreshPending
  refreshPending = refreshSession().finally(() => { refreshPending = null })
  return refreshPending
}

async function refreshSession() {
  const refresh = getRefreshToken()
  if (!refresh) return null

  try {
    const resposta = await fetchApi(apiUrl('/api/token/refresh/'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh }),
    })

    if (!resposta.ok) {
      if ([400, 401].includes(resposta.status) && getRefreshToken() === refresh) await limparTokens()
      return null
    }

    const dados = await resposta.json()
    return typeof dados.access === 'string' && session.setAccess(dados.access, refresh) ? dados.access : null
  } catch {
    return null
  }
}

export async function fetchAutenticado(url, options = {}, accessToken = null) {
  const executar = (token) => fetchApi(url, {
    ...options,
    headers: {
      ...options.headers,
      Authorization: `Bearer ${token}`,
    },
  })

  const tokenAtual = accessToken || getAccessToken()
  if (!tokenAtual) throw new Error('Sessão autenticada indisponível.')

  let resposta = await executar(tokenAtual)
  if (resposta.status !== 401) return resposta

  const tokenRenovado = await renovarSessao()
  if (!tokenRenovado) return resposta

  resposta = await executar(tokenRenovado)
  return resposta
}
