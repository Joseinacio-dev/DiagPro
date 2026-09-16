const SAFE_MODULE_STATUS = new Set(['completed', 'partial', 'unavailable', 'failed', 'canceled', 'not_applicable', 'not_supported'])

function text(value, limit) { return typeof value === 'string' ? value.replace(/[\r\n\t]+/g, ' ').trim().slice(0, limit) : undefined }
function integer(value, maximum) { return Number.isInteger(value) ? Math.max(0, Math.min(maximum, value)) : undefined }

export function buildOnlineDiagIaContext(context = {}, startupStatus = {}) {
  const moduleStatuses = Object.fromEntries(Object.entries(context.scan?.moduleStatuses || {}).filter(([name, status]) => text(name, 50) && SAFE_MODULE_STATUS.has(status)).slice(0, 30))
  const limitations = Array.isArray(context.scan?.limitations) ? context.scan.limitations.slice(0, 15).map((item) => text(item, 180)).filter(Boolean) : []
  return Object.fromEntries(Object.entries({
    deviceConnected: ['authorized', 'connected'].includes(context.device?.status),
    manufacturer: text(context.device?.manufacturer, 80), model: text(context.device?.model, 100),
    androidVersion: text(context.device?.android, 30), adbState: text(context.device?.status, 40),
    scanMode: text(context.scan?.mode, 30), scanStatus: text(context.scan?.status, 40),
    findingsCount: integer(context.scan?.findings, 100000), riskScore: integer(context.scan?.riskScore, 100),
    coverageStatus: text(context.scan?.coverageStatus, 40), moduleStatuses, appsFound: integer(context.scan?.appsFound, 100000),
    filesAnalyzed: integer(context.scan?.filesAnalyzed, 100000), limitations,
    apiStatus: text(startupStatus?.api?.status, 30), licenseStatus: text(context.license?.status, 40),
    diagproVersion: text(startupStatus?.appInfo?.version, 40),
  }).filter(([, value]) => value !== undefined))
}
