const AVAILABLE_MODULES = Object.freeze([
  'system',
  'apps',
  'permissions',
  'security',
  'battery',
  'storage',
  'performance',
  'files',
  'persistence',
  'userApps',
  'systemApps',
])

const QUICK_MODULES = Object.freeze([
  'system', 'apps', 'permissions', 'security', 'battery', 'storage',
])

const COMPLETE_MODULES = Object.freeze([
  'system', 'apps', 'permissions', 'security', 'battery', 'storage',
  'performance', 'files', 'persistence',
])

function normalizeScanMode(mode, modules = []) {
  if (!['quick', 'complete', 'custom'].includes(mode)) {
    const error = new Error('Modo de análise inválido.')
    error.code = 'INVALID_SCAN_MODE'
    throw error
  }
  if (mode === 'complete') return [...COMPLETE_MODULES]
  if (mode === 'custom') {
    return [...new Set(Array.isArray(modules) ? modules : [])]
      .filter((module) => AVAILABLE_MODULES.includes(module))
  }
  return [...QUICK_MODULES]
}

function packagePolicy(mode, modules = []) {
  const normalized = normalizeScanMode(mode, modules)
  if (!normalized.some((module) => ['apps', 'userApps', 'systemApps', 'permissions'].includes(module))) {
    return { enabled: false, types: [], detailsTypes: [] }
  }
  if (mode === 'complete') return { enabled: true, types: ['user', 'system'], detailsTypes: ['user', 'system'] }
  if (mode === 'quick') return { enabled: true, types: ['user', 'system'], detailsTypes: ['user'] }

  const explicitUser = normalized.includes('userApps')
  const explicitSystem = normalized.includes('systemApps')
  const types = explicitUser || explicitSystem
    ? [explicitUser && 'user', explicitSystem && 'system'].filter(Boolean)
    : ['user', 'system']
  const needsDetails = normalized.includes('permissions') || normalized.includes('security')
  return { enabled: true, types, detailsTypes: needsDetails ? types : [] }
}

function scanStages(mode, modules = []) {
  const normalized = normalizeScanMode(mode, modules)
  // Permissões dependem da enumeração de pacotes; essa dependência técnica é
  // executada sem habilitar qualquer outro módulo não selecionado.
  const packageEnabled = normalized.some((module) => ['apps', 'userApps', 'systemApps', 'permissions'].includes(module))
  const stages = [
    { id: 'identification', label: 'Identificando dispositivo', module: null },
    { id: 'system', label: 'Analisando sistema', module: 'system' },
    { id: 'apps', label: 'Analisando aplicativos', enabled: packageEnabled },
    { id: 'permissions', label: 'Analisando permissões acessíveis', module: 'permissions' },
    { id: 'files', label: 'Analisando arquivos acessíveis', module: 'files' },
    { id: 'security', label: 'Verificando segurança', module: 'security' },
    { id: 'persistence', label: 'Verificando persistência e configurações', module: 'persistence' },
    { id: 'battery', label: 'Verificando bateria', module: 'battery' },
    { id: 'storage', label: 'Verificando armazenamento', module: 'storage' },
    { id: 'performance', label: 'Verificando desempenho', module: 'performance' },
  ].filter((stage) => stage.module === null || stage.enabled === true || normalized.includes(stage.module))
  stages.push({ id: 'consolidation', label: 'Consolidando resultados', module: null })
  return stages
}

module.exports = {
  AVAILABLE_MODULES,
  COMPLETE_MODULES,
  QUICK_MODULES,
  normalizeScanMode,
  packagePolicy,
  scanStages,
}
