function resumirArquivosParaHistorico(files) {
  if (!files) return files ?? null
  const { items: _items, attention: _attention, recentAttention: _recentAttention, ...summary } = files
  return {
    ...summary,
    attentionCount: Array.isArray(files.attention) ? files.attention.length : 0,
    recentAttentionCount: Array.isArray(files.recentAttention) ? files.recentAttention.length : 0,
    itemsPersisted: false,
  }
}

export function resultadoTecnicoParaHistorico(resultado) {
  if (!resultado || typeof resultado !== 'object') return resultado
  return {
    ...resultado,
    files: resumirArquivosParaHistorico(resultado.files),
  }
}

export function criarPayloadDiagnostico(resultado, serial) {
  const device = resultado?.device || resultado?.system || {}
  const health = resultado?.health || {}
  const apps = resultado?.apps

  return {
    serial,
    fabricante: device.manufacturer || '',
    modelo: device.model || '',
    versao_android: device.androidVersion || '',
    sdk: device.sdk ?? null,
    security_patch: resultado?.security?.securityPatch ?? device.securityPatch ?? null,
    modo: resultado?.mode,
    modulos: resultado?.modules,
    iniciado_em: resultado?.startedAt,
    finalizado_em: resultado?.finishedAt,
    health_available: health.available ?? null,
    health_score: health.score ?? null,
    health_label: health.label || '',
    health_explanation: health.explanation || '',
    bateria: resultado?.battery ?? null,
    armazenamento: resultado?.storage ?? null,
    memoria: resultado?.memory ?? null,
    apps: apps
      ? {
          total: apps.total ?? null,
          userTotal: apps.userTotal ?? null,
          systemTotal: apps.systemTotal ?? null,
        }
      : null,
    warnings: resultado?.warnings || [],
    stages: resultado?.stages || {},
    resultado_tecnico: resultadoTecnicoParaHistorico(resultado),
  }
}

async function lerResposta(resposta) {
  try {
    return await resposta.json()
  } catch {
    return null
  }
}

export async function persistirDiagnostico({
  resultado,
  serial,
  accessToken,
  diagnosticsUrl,
  fetchAuthenticated,
}) {
  const resposta = await fetchAuthenticated(diagnosticsUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(criarPayloadDiagnostico(resultado, serial)),
  }, accessToken)
  const dados = await lerResposta(resposta)

  if (!resposta.ok) {
    const erro = new Error('Não foi possível salvar o diagnóstico no histórico.')
    erro.status = resposta.status
    erro.details = dados
    throw erro
  }

  return dados
}
