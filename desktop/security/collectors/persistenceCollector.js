const { ADB_ERROR_CODES, availabilityFromError } = require('../../adb/adbErrors')
const { validPackageName } = require('../parsers/packageParsers')

const TERMINAL_CODES = new Set([
  ADB_ERROR_CODES.SCAN_ABORTED,
  ADB_ERROR_CODES.DEVICE_DISCONNECTED,
  ADB_ERROR_CODES.DEVICE_OFFLINE,
  ADB_ERROR_CODES.DEVICE_UNAUTHORIZED,
])

function throwIfTerminal(error) {
  if (TERMINAL_CODES.has(error?.code || error?.codigo)) throw error
}

function parseOverlays(output = '') {
  const text = String(output)
  if (/unknown command|not supported|can't find service/i.test(text)) return { status: 'not_supported', value: [], reason: 'COMMAND_NOT_SUPPORTED' }
  if (/permission denial|securityexception/i.test(text)) return { status: 'not_available', value: [], reason: 'ADB_PERMISSION_DENIED' }
  const value = text.split(/\r?\n/).map((line) => line.trim()).map((line) => {
    const match = line.match(/^\[([x ])]\s+([A-Za-z][A-Za-z0-9_.-]+)$/i)
    return match && validPackageName(match[2]) ? { packageName: match[2], enabled: match[1].toLowerCase() === 'x' } : null
  }).filter(Boolean)
  return { status: 'available', value, reason: null }
}

function parseActiveServices(output = '') {
  const text = String(output)
  if (/permission denial|securityexception/i.test(text)) return { status: 'not_available', value: [], reason: 'ADB_PERMISSION_DENIED' }
  const services = new Map()
  text.split(/\r?\n/).forEach((line) => {
    const match = line.match(/ServiceRecord\{[^}]*\s([A-Za-z][A-Za-z0-9_.-]+)\/([^\s}]+)}/)
    if (!match || !validPackageName(match[1])) return
    services.set(`${match[1]}/${match[2]}`, { packageName: match[1], componentName: `${match[1]}/${match[2]}` })
  })
  return { status: text.trim() ? 'available' : 'not_available', value: [...services.values()], reason: text.trim() ? null : 'EMPTY_OUTPUT' }
}

function parseVpnState(output = '') {
  const text = String(output)
  if (/permission denial|securityexception/i.test(text)) return { status: 'not_available', active: null, reason: 'ADB_PERMISSION_DENIED' }
  if (!text.trim()) return { status: 'not_available', active: null, reason: 'EMPTY_OUTPUT' }
  const active = /TRANSPORT_VPN[^\r\n]*(?:CONNECTED|VALIDATED)|(?:CONNECTED|VALIDATED)[^\r\n]*TRANSPORT_VPN/i.test(text)
  return { status: 'available', active, reason: null }
}

function createPersistenceCollector({ adb, timeout = 30000 } = {}) {
  async function collect(serial, { signal = null, security = null, apps = null } = {}) {
    async function query(args, parser) {
      try {
        return parser(await adb.runDevice(serial, ['shell', ...args], { signal, timeout, maxBuffer: 16 * 1024 * 1024 }))
      } catch (error) {
        throwIfTerminal(error)
        return { ...availabilityFromError(error), value: [], reason: error?.code || 'COMMAND_FAILED' }
      }
    }
    const [overlays, activeServices, vpn] = await Promise.all([
      query(['cmd', 'overlay', 'list'], parseOverlays),
      query(['dumpsys', 'activity', 'services'], parseActiveServices),
      query(['dumpsys', 'connectivity'], parseVpnState),
    ])
    const disabledPackages = (apps?.items || []).filter((app) => app.enabled === false).map((app) => app.packageName)
    const suspendedPackages = (apps?.items || []).filter((app) => app.suspended === true).map((app) => app.packageName)
    return {
      status: [overlays.status, activeServices.status, vpn.status].every((status) => status === 'available') ? 'available' : 'partial',
      accessibilityServices: security?.accessibility?.enabledServices || [],
      deviceAdmins: security?.deviceAdmins || { status: 'not_executed', value: [] },
      overlays,
      vpn,
      activeServices,
      disabledPackages,
      suspendedPackages,
      receivers: { status: 'not_available', value: [], reason: 'NO_RELIABLE_NON_ROOT_BULK_SOURCE' },
      limitations: [
        'Serviços exibidos são somente os observáveis pelo dumpsys no momento da coleta.',
        'Receivers e persistência em áreas privadas não são enumerados de forma completa sem privilégios adicionais.',
        'A presença de serviço, overlay, VPN ou administrador não constitui evidência de malware.',
      ],
      collection: { commandCount: 3, method: 'read_only_dumpsys_and_cmd' },
    }
  }
  return { collect }
}

module.exports = { createPersistenceCollector, parseActiveServices, parseOverlays, parseVpnState, throwIfTerminal }
