function completedCredit(status) {
  return status === 'completed' ? 1 : 0
}

function buildTechnicalCoverage(result = {}) {
  const stageEntries = Object.entries(result.stages || {})
    .filter(([id]) => !['identification', 'consolidation'].includes(id))
  let expectedUnits = 0
  let completedUnits = 0
  const modules = {}

  for (const [id, stage] of stageEntries) {
    let expected = 1
    let completed = completedCredit(stage?.status)
    if (id === 'apps' && result.apps) {
      expected = Math.max(1, result.apps.analysis?.detailedRequested || result.apps.analysis?.found || result.apps.total || 0)
      completed = result.apps.analysis?.detailedRequested > 0
        ? result.apps.analysis?.detailedAnalyzed || 0
        : result.apps.analysis?.basicAnalyzed || 0
    }
    if (id === 'files' && result.files) {
      expected = Math.max(1, result.files.found || 0)
      completed = result.files.analyzed || 0
    }
    expectedUnits += expected
    completedUnits += Math.min(expected, completed)
    modules[id] = { status: stage?.status || 'not_executed', expected, completed: Math.min(expected, completed) }
  }

  const completedModules = stageEntries.filter(([, stage]) => stage?.status === 'completed').length
  const partialModules = stageEntries.filter(([, stage]) => stage?.status === 'partial').length
  const unavailableModules = stageEntries.filter(([, stage]) => stage?.status === 'unavailable').length
  const failedModules = stageEntries.filter(([, stage]) => stage?.status === 'failed').length
  const canceledModules = stageEntries.filter(([, stage]) => ['canceled', 'device_disconnected'].includes(stage?.status)).length
  const processedModules = stageEntries.filter(([, stage]) => (
    ['completed', 'partial', 'unavailable', 'failed'].includes(stage?.status)
  )).length
  const limitations = [...new Set([
    ...(result.files?.limitations || []),
    'O Android sem root não permite inspecionar sandboxes privados de aplicativos nem áreas protegidas por SELinux.',
  ])]
  return {
    status: limitations.length > 0 || completedUnits < expectedUnits ? 'limited' : 'complete',
    percent: expectedUnits > 0 ? Math.round((completedUnits / expectedUnits) * 100) : 0,
    scope: 'fontes_acessiveis_sem_root',
    expectedUnits,
    completedUnits,
    modules,
    modulesCompleted: completedModules,
    modulesPartial: partialModules,
    modulesUnavailable: unavailableModules,
    modulesFailed: failedModules,
    modulesCanceled: canceledModules,
    modulesRequested: stageEntries.length,
    modulesProcessed: processedModules,
    modulesProcessedPercent: stageEntries.length > 0
      ? Math.round((processedModules / stageEntries.length) * 100)
      : 0,
    appsFound: result.apps?.analysis?.found ?? null,
    appsAnalyzed: result.apps?.analysis?.detailedRequested > 0
      ? result.apps?.analysis?.detailedAnalyzed ?? null
      : result.apps?.analysis?.basicAnalyzed ?? null,
    filesFound: result.files?.found ?? null,
    filesAnalyzed: result.files?.analyzed ?? null,
    limitations,
    explanation: 'Percentual calculado por unidades de trabalho realmente solicitadas e concluídas no escopo acessível sem root; não representa cobertura integral do telefone nem certificação de segurança.',
  }
}

module.exports = { buildTechnicalCoverage, completedCredit }
