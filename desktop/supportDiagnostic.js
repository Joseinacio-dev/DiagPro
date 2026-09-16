const SAFE_STATUSES = new Set([
  'authorized', 'connected', 'waiting', 'disconnected', 'unauthorized', 'offline',
  'multiple', 'adb_unavailable', 'error', 'online', 'checking', 'unavailable',
  'completed', 'partial', 'failed', 'canceled', 'device_disconnected', 'idle',
])

function safeText(value, fallback = 'Não informado', limit = 100) {
  if (typeof value !== 'string') return fallback
  const clean = value.replace(/[\r\n\t]/g, ' ').trim().slice(0, limit)
  return clean || fallback
}

function safeStatus(value, fallback = 'unavailable') {
  const normalized = String(value || '').toLowerCase()
  return SAFE_STATUSES.has(normalized) ? normalized : fallback
}

function safeInteger(value, maximum = 100000) {
  const number = Number(value)
  if (!Number.isFinite(number)) return 0
  return Math.max(0, Math.min(maximum, Math.trunc(number)))
}

function sanitizeSupportPayload(payload = {}) {
  const modules = Array.isArray(payload.scan?.unavailableModules)
    ? payload.scan.unavailableModules.slice(0, 20).map((item) => safeText(item, 'Módulo não informado', 60))
    : []

  return {
    api: { status: safeStatus(payload.api?.status) },
    adb: {
      status: safeStatus(payload.adb?.status || payload.device?.status),
      available: payload.adb?.available === true,
      version: safeText(payload.adb?.version),
    },
    device: {
      status: safeStatus(payload.device?.status),
      model: safeText(payload.device?.model),
      manufacturer: safeText(payload.device?.manufacturer),
      android: safeText(payload.device?.android),
    },
    scan: {
      status: safeStatus(payload.scan?.status, 'idle'),
      mode: safeText(payload.scan?.mode),
      findings: safeInteger(payload.scan?.findings),
      coveragePercent: safeInteger(payload.scan?.coveragePercent, 100),
      coverageStatus: safeText(payload.scan?.coverageStatus),
      unavailableModules: modules,
    },
  }
}

function sanitizeLogEntry(entry) {
  if (!entry || typeof entry !== 'object') return null
  const result = {
    timestamp: safeText(entry.timestamp, 'Não informado', 40),
    level: entry.level === 'error' ? 'error' : 'info',
    event: safeText(entry.event, 'unknown', 80),
  }
  for (const key of ['code', 'mode', 'state', 'targetKind', 'type']) {
    if (typeof entry[key] === 'string') result[key] = safeText(entry[key], '', 100)
  }
  if (Number.isFinite(entry.moduleCount)) result.moduleCount = safeInteger(entry.moduleCount)
  return result
}

function buildSupportDiagnostic({ payload, runtime, logs = [] }) {
  return {
    schemaVersion: 1,
    generatedAt: safeText(runtime?.generatedAt, new Date().toISOString(), 40),
    application: {
      name: 'DiagPro',
      version: safeText(runtime?.version),
      channel: 'Beta',
      packaged: runtime?.packaged === true,
    },
    operatingSystem: {
      platform: safeText(runtime?.platform),
      version: safeText(runtime?.osVersion),
      architecture: safeText(runtime?.architecture),
    },
    ...sanitizeSupportPayload(payload),
    recentLogs: logs.map(sanitizeLogEntry).filter(Boolean).slice(-30),
    privacy: 'Arquivo técnico sanitizado: não inclui senhas, tokens, chaves, URLs internas ou serial do dispositivo.',
  }
}

module.exports = { buildSupportDiagnostic, sanitizeLogEntry, sanitizeSupportPayload }
