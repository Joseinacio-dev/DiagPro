const crypto = require('crypto')
const path = require('path')

const DANGEROUS_EXTENSIONS = new Set([
  '.apk', '.apks', '.xapk', '.exe', '.com', '.msi', '.msp', '.bat', '.cmd',
  '.ps1', '.psm1', '.vbs', '.vbe', '.js', '.jse', '.wsf', '.wsh', '.scr',
  '.dll', '.jar', '.sh', '.py', '.lnk', '.reg',
])

const WINDOWS_RESERVED_NAMES = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i

function safeAndroidPath(value, allowedRoots = ['/storage/emulated/0', '/sdcard']) {
  if (typeof value !== 'string' || value.length < 2 || value.length > 4096) return false
  if (/[\0\r\n]/.test(value) || value.includes('\\')) return false
  if (!value.startsWith('/') || value.split('/').includes('..')) return false
  return allowedRoots.some((root) => value === root || value.startsWith(`${root}/`))
}

function extensionOfAndroidPath(value) {
  const name = String(value || '').split('/').at(-1) || ''
  const extension = path.posix.extname(name).toLowerCase()
  return /^\.[a-z0-9]{1,12}$/.test(extension) ? extension : ''
}

function classifyAndroidFile(value) {
  const extension = extensionOfAndroidPath(value)
  const groups = {
    image: new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.heic']),
    video: new Set(['.mp4', '.mkv', '.webm', '.avi', '.mov']),
    audio: new Set(['.mp3', '.m4a', '.aac', '.ogg', '.wav', '.flac']),
    document: new Set(['.pdf', '.txt', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx']),
    archive: new Set(['.zip', '.rar', '.7z', '.tar', '.gz']),
  }
  const type = Object.entries(groups).find(([, extensions]) => extensions.has(extension))?.[0]
    || (DANGEROUS_EXTENSIONS.has(extension) ? 'executable_or_script' : 'unknown')
  return { extension: extension || null, type, potentiallyDangerous: DANGEROUS_EXTENSIONS.has(extension) }
}

function safeQuarantineName(sessionId, sequence = 0) {
  const normalizedSession = typeof sessionId === 'string' && /^[A-Za-z0-9-]{8,64}$/.test(sessionId)
    ? sessionId
    : crypto.randomUUID()
  const safeSequence = Number.isSafeInteger(sequence) && sequence >= 0 ? sequence : 0
  return `${normalizedSession}-${String(safeSequence).padStart(6, '0')}.bin`
}

function safeLocalLeafName(value) {
  if (typeof value !== 'string' || !value || value.length > 255) return false
  if (WINDOWS_RESERVED_NAMES.test(value) || /[<>:"/\\|?*\0-\x1f]/.test(value)) return false
  return value !== '.' && value !== '..' && !/[. ]$/.test(value)
}

module.exports = {
  DANGEROUS_EXTENSIONS,
  classifyAndroidFile,
  extensionOfAndroidPath,
  safeAndroidPath,
  safeLocalLeafName,
  safeQuarantineName,
}
