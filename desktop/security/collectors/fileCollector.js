const { ADB_ERROR_CODES, availabilityFromError } = require('../../adb/adbErrors')
const { classifyAndroidFile, safeAndroidPath } = require('../../adb/androidContentSafety')

const BASE_ROOTS = Object.freeze(['/storage/emulated/0', '/sdcard'])
const TERMINAL_CODES = new Set([
  ADB_ERROR_CODES.SCAN_ABORTED,
  ADB_ERROR_CODES.DEVICE_DISCONNECTED,
  ADB_ERROR_CODES.DEVICE_OFFLINE,
  ADB_ERROR_CODES.DEVICE_UNAUTHORIZED,
])

function errorCode(error) {
  return error?.code || error?.codigo || ADB_ERROR_CODES.COMMAND_FAILED
}

function throwIfTerminal(error) {
  if (TERMINAL_CODES.has(errorCode(error))) throw error
}

function safeFailure(error, root = null) {
  const code = errorCode(error)
  const permissionDenied = /permission (?:denied|denial)/i.test(error?.message || error?.details?.output || '')
  const availability = permissionDenied
    ? { status: 'not_available', reason: 'PERMISSION_DENIED' }
    : availabilityFromError(error)
  return {
    ...(root ? { root } : {}),
    ...availability,
    errorType: permissionDenied ? 'PERMISSION_DENIED' : code,
    exitCode: Number.isInteger(error?.cause?.code) ? error.cause.code : null,
  }
}

function parseStatRecords(output, { roots = BASE_ROOTS, nowMs = Date.now(), maxItems = 50000 } = {}) {
  const nonEmptyLines = String(output || '').split(/\r?\n/).filter(Boolean)
  const items = []
  let rejected = 0
  let truncated = 0
  for (const line of nonEmptyLines) {
    const match = line.match(/^(.*)\t(\d+)\t(\d+)\t([0-9a-fA-F]+)$/)
    if (!match || !safeAndroidPath(match[1], roots)) {
      rejected += 1
      continue
    }
    if (items.length >= maxItems) {
      truncated += 1
      continue
    }
    const sizeBytes = Number(match[2])
    const modifiedEpochSeconds = Number(match[3])
    if (!Number.isSafeInteger(sizeBytes) || sizeBytes < 0 || !Number.isSafeInteger(modifiedEpochSeconds)) {
      rejected += 1
      continue
    }
    const classification = classifyAndroidFile(match[1])
    items.push({
      path: match[1],
      name: match[1].split('/').at(-1) || null,
      sizeBytes,
      modifiedAt: modifiedEpochSeconds > 0 ? new Date(modifiedEpochSeconds * 1000).toISOString() : null,
      mode: match[4].toLowerCase(),
      metadataAvailable: true,
      ...classification,
      recent: modifiedEpochSeconds > 0 && nowMs - (modifiedEpochSeconds * 1000) <= 30 * 86400000,
      evidenceStatus: classification.potentiallyDangerous ? 'attention' : 'no_evidence',
    })
  }
  return { found: nonEmptyLines.length, analyzed: items.length, rejected, truncated, items }
}

function parsePathRecords(output, { roots = BASE_ROOTS, maxItems = 50000 } = {}) {
  const nonEmptyLines = String(output || '').split(/\r?\n/).filter(Boolean)
  const items = []
  let rejected = 0
  let truncated = 0
  for (const filePath of nonEmptyLines) {
    if (!safeAndroidPath(filePath, roots)) {
      rejected += 1
      continue
    }
    if (items.length >= maxItems) {
      truncated += 1
      continue
    }
    const classification = classifyAndroidFile(filePath)
    items.push({
      path: filePath,
      name: filePath.split('/').at(-1) || null,
      sizeBytes: null,
      modifiedAt: null,
      mode: null,
      metadataAvailable: false,
      ...classification,
      recent: null,
      evidenceStatus: classification.potentiallyDangerous ? 'attention' : 'no_evidence',
    })
  }
  return { found: nonEmptyLines.length, analyzed: items.length, rejected, truncated, items }
}

function createFileCollector({ adb, maxItems = 50000, timeout = 120000, maxBuffer = 64 * 1024 * 1024, now = () => Date.now() } = {}) {
  async function probeRoot(serial, candidate, { signal = null } = {}) {
    const startedAt = Date.now()
    let probeMethod = 'test_directory'
    try {
      await adb.runDevice(serial, ['shell', 'test', '-d', candidate], { signal, timeout: 10000 })
    } catch (testError) {
      throwIfTerminal(testError)
      probeMethod = 'list_directory'
      try {
        await adb.runDevice(serial, ['shell', 'ls', '-ld', candidate], { signal, timeout: 10000 })
      } catch (listError) {
        throwIfTerminal(listError)
        return {
          path: candidate,
          accessible: false,
          status: 'unavailable',
          probeMethod,
          durationMs: Date.now() - startedAt,
          ...safeFailure(listError),
        }
      }
    }

    let canonicalPath = candidate
    try {
      const resolved = (await adb.runDevice(serial, ['shell', 'readlink', '-f', candidate], {
        signal, timeout: 10000,
      })).trim()
      const allowedRoots = candidate.startsWith('/storage/') ? ['/storage', '/sdcard'] : BASE_ROOTS
      if (resolved && safeAndroidPath(resolved, allowedRoots)) canonicalPath = resolved
    } catch (error) {
      throwIfTerminal(error)
      // readlink só deduplica aliases e não determina a acessibilidade da raiz.
    }

    return {
      path: candidate,
      canonicalPath,
      accessible: true,
      status: 'accessible',
      probeMethod,
      errorType: null,
      exitCode: null,
      durationMs: Date.now() - startedAt,
    }
  }

  async function accessibleRoots(serial, { signal = null } = {}) {
    const candidates = [...BASE_ROOTS]
    let discovery = { status: 'completed', errorType: null, exitCode: null }
    try {
      const storageEntries = await adb.runDevice(serial, ['shell', 'ls', '-1', '/storage'], {
        signal, timeout: 15000,
      })
      storageEntries.split(/\r?\n/).map((entry) => entry.trim()).filter((entry) => (
        /^[A-Za-z0-9._-]{1,64}$/.test(entry) && !['emulated', 'self'].includes(entry)
      )).forEach((entry) => candidates.push(`/storage/${entry}`))
    } catch (error) {
      throwIfTerminal(error)
      discovery = { status: 'partial', ...safeFailure(error) }
    }

    const roots = []
    const checks = []
    const canonical = new Set()
    for (const candidate of [...new Set(candidates)]) {
      const check = await probeRoot(serial, candidate, { signal })
      checks.push(check)
      if (!check.accessible || canonical.has(check.canonicalPath)) continue
      canonical.add(check.canonicalPath)
      roots.push({ path: candidate, canonicalPath: check.canonicalPath })
    }
    return { roots, checks, discovery }
  }

  async function findPaths(serial, root, options) {
    const strategies = [
      { method: 'find_print', args: ['shell', 'find', root.path, '-type', 'f', '-print'] },
      { method: 'toybox_find_print', args: ['shell', 'toybox', 'find', root.path, '-type', 'f', '-print'] },
    ]
    let lastError = null
    for (const strategy of strategies) {
      try {
        const output = await adb.runDevice(serial, strategy.args, options)
        return { output, method: strategy.method }
      } catch (error) {
        throwIfTerminal(error)
        lastError = error
      }
    }
    throw lastError
  }

  async function enumerateRoot(serial, root, { signal = null, remaining = maxItems } = {}) {
    const startedAt = Date.now()
    const options = { signal, timeout, maxBuffer }
    const allowedRoots = [root.path, root.canonicalPath]
    let statFailure = null
    try {
      const output = await adb.runDevice(serial, [
        'shell', 'find', root.path, '-type', 'f', '-exec',
        'stat', '-c', '%n\t%s\t%Y\t%f', '{}', '+',
      ], options)
      const parsed = parseStatRecords(output, { roots: allowedRoots, nowMs: now(), maxItems: remaining })
      if (parsed.found > 0 && parsed.analyzed > 0) {
        return { ...parsed, method: 'find_exec_stat', metadataComplete: parsed.rejected === 0, durationMs: Date.now() - startedAt }
      }

      // Saída vazia pode significar zero real ou stat incompatível/silencioso.
      const fallback = await findPaths(serial, root, options)
      const fallbackParsed = parsePathRecords(fallback.output, { roots: allowedRoots, maxItems: remaining })
      if (fallbackParsed.found === 0) {
        return { ...fallbackParsed, method: fallback.method, metadataComplete: true, zeroConfirmed: true, durationMs: Date.now() - startedAt }
      }
      return { ...fallbackParsed, method: fallback.method, metadataComplete: false, statFallback: true, durationMs: Date.now() - startedAt }
    } catch (error) {
      throwIfTerminal(error)
      statFailure = error
    }

    try {
      const fallback = await findPaths(serial, root, options)
      const parsed = parsePathRecords(fallback.output, { roots: allowedRoots, maxItems: remaining })
      return {
        ...parsed,
        method: fallback.method,
        metadataComplete: parsed.found === 0,
        statFallback: true,
        statErrorType: errorCode(statFailure),
        zeroConfirmed: parsed.found === 0,
        durationMs: Date.now() - startedAt,
      }
    } catch (error) {
      throwIfTerminal(error)
      throw error
    }
  }

  async function collectFiles(serial, { signal = null, onProgress = () => {} } = {}) {
    const discovered = await accessibleRoots(serial, { signal })
    const items = []
    const failures = []
    const rootDiagnostics = discovered.checks.map((check) => ({ ...check, found: null }))
    let found = 0
    let rejected = 0
    let truncated = 0
    let metadataFallbacks = 0
    let successfulRoots = 0

    for (let index = 0; index < discovered.roots.length; index += 1) {
      const root = discovered.roots[index]
      try {
        const parsed = await enumerateRoot(serial, root, {
          signal,
          remaining: Math.max(0, maxItems - items.length),
        })
        successfulRoots += 1
        found += parsed.found
        rejected += parsed.rejected
        truncated += parsed.truncated
        items.push(...parsed.items)
        if (parsed.statFallback || !parsed.metadataComplete) metadataFallbacks += 1
        const diagnostic = rootDiagnostics.find((entry) => entry.path === root.path)
        if (diagnostic) Object.assign(diagnostic, {
          found: parsed.found,
          analyzed: parsed.analyzed,
          enumerationStatus: parsed.statFallback || !parsed.metadataComplete ? 'partial' : 'completed',
          method: parsed.method,
          durationMs: parsed.durationMs,
          errorType: parsed.statErrorType || null,
        })
      } catch (error) {
        throwIfTerminal(error)
        const failure = safeFailure(error, root.path)
        failures.push(failure)
        const diagnostic = rootDiagnostics.find((entry) => entry.path === root.path)
        if (diagnostic) Object.assign(diagnostic, {
          found: null,
          analyzed: 0,
          enumerationStatus: failure.status === 'error' ? 'failed' : 'unavailable',
          errorType: failure.errorType,
          exitCode: failure.exitCode,
        })
      }
      onProgress({ found, analyzed: items.length, rootIndex: index + 1, rootTotal: discovered.roots.length })
    }

    const inaccessibleChecks = rootDiagnostics.filter((entry) => !entry.accessible)
    const unexpectedFailure = failures.some((failure) => failure.status === 'error')
    let status = 'available'
    let collectionState = 'COMPLETED'
    if (successfulRoots === 0) {
      status = unexpectedFailure ? 'failed' : 'not_available'
      collectionState = unexpectedFailure ? 'FAILED' : 'UNAVAILABLE'
    } else if (
      failures.length || inaccessibleChecks.length || metadataFallbacks || rejected || truncated
      || discovered.discovery.status !== 'completed'
    ) {
      status = 'partial'
      collectionState = 'PARTIAL'
    }

    const dangerous = items.filter((item) => item.potentiallyDangerous)
    const recentRelevant = items.filter((item) => item.recent === true && item.potentiallyDangerous)
    return {
      status,
      collectionState,
      found,
      analyzed: items.length,
      rejected,
      truncated,
      zeroConfirmed: collectionState === 'COMPLETED' && found === 0,
      roots: discovered.roots,
      rootDiagnostics,
      discovery: discovered.discovery,
      failures,
      items,
      attention: dangerous,
      recentAttention: recentRelevant,
      copiedToComputer: 0,
      defender: { status: 'not_needed', reason: 'METADATA_ONLY_NO_FILES_COPIED' },
      limitations: [
        'Áreas privadas de aplicativos protegidas pelo Android não puderam ser acessadas sem root.',
        'Áreas protegidas por SELinux ou por permissões do fabricante não foram contornadas.',
        'Extensão e nome de arquivo são apenas contexto técnico e não confirmam ameaça.',
        ...(metadataFallbacks ? ['Parte dos arquivos foi enumerada sem tamanho ou data porque stat não estava disponível.'] : []),
      ],
      collection: {
        commandCount: discovered.roots.length + discovered.checks.length + 1,
        method: metadataFallbacks ? 'metadata_only_adb_find_with_fallback' : 'metadata_only_adb_find_stat',
        contentRead: false,
      },
    }
  }

  return { accessibleRoots, collectFiles, enumerateRoot }
}

module.exports = {
  BASE_ROOTS,
  createFileCollector,
  parsePathRecords,
  parseStatRecords,
  safeFailure,
  throwIfTerminal,
}
