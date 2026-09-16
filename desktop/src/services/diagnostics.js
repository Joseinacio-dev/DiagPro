import { fetchAutenticado } from '../utils/auth.js'
import { apiUrl } from '../config/api.js'
import { persistirDiagnostico } from './diagnosticPersistence.mjs'

const DIAGNOSTICS_URL = apiUrl('/api/diagnosticos/')

async function lerResposta(resposta) {
  try {
    return await resposta.json()
  } catch {
    return null
  }
}

function criarErroApi(resposta, dados, mensagem) {
  const erro = new Error(mensagem)
  erro.status = resposta.status
  erro.details = dados
  return erro
}

export async function salvarDiagnostico(resultado, { serial, accessToken } = {}) {
  return persistirDiagnostico({
    resultado,
    serial,
    accessToken,
    diagnosticsUrl: DIAGNOSTICS_URL,
    fetchAuthenticated: fetchAutenticado,
  })
}

export async function salvarRemediacao(diagnosticoId, remediation, { accessToken } = {}) {
  if (!diagnosticoId) {
    throw new Error('O diagnóstico salvo é necessário para sincronizar a remediação.')
  }

  const resposta = await fetchAutenticado(
    `${DIAGNOSTICS_URL}${encodeURIComponent(diagnosticoId)}/remediations/`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(remediation),
    },
    accessToken,
  )
  const dados = await lerResposta(resposta)

  if (!resposta.ok) {
    throw criarErroApi(resposta, dados, 'Não foi possível sincronizar a correção com o histórico.')
  }

  return dados
}

export async function listarRemediacoes(diagnosticoId, { accessToken } = {}) {
  if (!diagnosticoId) throw new Error('O diagnóstico é necessário para consultar as correções.')
  const resposta = await fetchAutenticado(
    `${DIAGNOSTICS_URL}${encodeURIComponent(diagnosticoId)}/remediations/`,
    {},
    accessToken,
  )
  const dados = await lerResposta(resposta)
  if (!resposta.ok) {
    throw criarErroApi(resposta, dados, 'Não foi possível consultar a auditoria de correções.')
  }
  return dados
}

export async function listarDiagnosticos({ accessToken } = {}) {
  const resposta = await fetchAutenticado(DIAGNOSTICS_URL, {}, accessToken)
  const dados = await lerResposta(resposta)
  if (!resposta.ok) {
    throw criarErroApi(resposta, dados, 'Não foi possível carregar o histórico de diagnósticos.')
  }
  return dados
}

export async function obterDiagnostico(id, { accessToken } = {}) {
  const resposta = await fetchAutenticado(`${DIAGNOSTICS_URL}${encodeURIComponent(id)}/`, {}, accessToken)
  const dados = await lerResposta(resposta)
  if (!resposta.ok) {
    throw criarErroApi(resposta, dados, 'Não foi possível carregar o diagnóstico.')
  }
  return dados
}

export async function associarClienteAoDiagnostico(id, clienteId, { accessToken } = {}) {
  const resposta = await fetchAutenticado(
    `${DIAGNOSTICS_URL}${encodeURIComponent(id)}/cliente/`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cliente_id: clienteId }),
    },
    accessToken,
  )
  const dados = await lerResposta(resposta)
  if (!resposta.ok) {
    throw criarErroApi(resposta, dados, 'Não foi possível associar o cliente ao diagnóstico.')
  }
  return dados
}
