const { ADB_ERROR_CODES, availabilityFromError, createAdbError } = require('../../adb/adbErrors')
const {
  applySpecialCapabilityStates,
  parsePackageDetails,
  parsePackageDump,
  parsePackageList,
  validApkPath,
} = require('../parsers/packageParsers')

const TERMINAL_CODES = new Set([
  ADB_ERROR_CODES.SCAN_ABORTED,
  ADB_ERROR_CODES.DEVICE_DISCONNECTED,
  ADB_ERROR_CODES.DEVICE_OFFLINE,
  ADB_ERROR_CODES.DEVICE_UNAUTHORIZED,
])

function throwIfTerminal(error) {
  if (TERMINAL_CODES.has(error?.code || error?.codigo)) throw error
}

async function mapWithConcurrency(items, limit, mapper) {
  const results = new Array(items.length)
  let nextIndex = 0
  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex
      nextIndex += 1
      results[index] = await mapper(items[index], index)
    }
  }
  await Promise.all(Array.from({ length: Math.min(Math.max(1, limit), items.length) }, () => worker()))
  return results
}

function createPackageCollector({
  adb,
  deviceCollector,
  securityCollector,
  detailConcurrency = 4,
  extendedTimeout = 20000,
  bulkDumpTimeout = 60000,
  bulkDumpMaxBuffer = 64 * 1024 * 1024,
  hashBatchSize = 16,
  hashBatchConcurrency = 2,
  hashTimeout = 30000,
} = {}) {
  async function collectHashes(serial, detailsByPackage, {
    signal = null,
    packageNames = null,
  } = {}) {
    const selected = packageNames ? new Set(packageNames) : null
    const candidates = [...detailsByPackage.entries()]
      .filter(([packageName, details]) => (
        details?.available
        && validApkPath(details.apkPath)
        && (!selected || selected.has(packageName))
      ))
    const batches = []
    for (let index = 0; index < candidates.length; index += hashBatchSize) {
      batches.push(candidates.slice(index, index + hashBatchSize))
    }

    await mapWithConcurrency(batches, hashBatchConcurrency, async (batch) => {
      batch.forEach(([, details]) => {
        details.integrity.hash = { algorithm: 'SHA-256', hash: null, status: 'not_verified', reason: 'HASH_COMMAND_UNAVAILABLE' }
      })
      try {
        const output = await adb.runDevice(
          serial,
          ['shell', 'sha256sum', ...batch.map(([, details]) => details.apkPath)],
          { signal, timeout: hashTimeout },
        )
        const hashesByPath = new Map()
        output.split(/\r?\n/).forEach((line) => {
          const match = line.trim().match(/^([a-fA-F0-9]{64})\s+(.+)$/)
          if (match && validApkPath(match[2])) hashesByPath.set(match[2], match[1].toLowerCase())
        })
        batch.forEach(([, details]) => {
          const hash = hashesByPath.get(details.apkPath)
          details.integrity.hash = hash
            ? { algorithm: 'SHA-256', hash, status: 'available', reason: null }
            : { algorithm: 'SHA-256', hash: null, status: 'not_verified', reason: 'INVALID_HASH_OUTPUT' }
        })
      } catch (error) {
        throwIfTerminal(error)
      }
    })

    const hashedPackages = candidates.filter(([, details]) => details.integrity.hash.status === 'available').length
    return {
      status: hashedPackages > 0 ? 'available' : 'not_available',
      reason: hashedPackages > 0 ? null : candidates.length > 0 ? 'HASH_UNAVAILABLE' : 'NO_SELECTED_ACCESSIBLE_APK',
      requestedPackages: selected ? selected.size : detailsByPackage.size,
      hashedPackages,
      commandCount: batches.length,
    }
  }

  async function collectPackageDetails(serial, selectedApps, {
    signal = null,
    currentUserId = null,
    enabledAccessibilityServices = [],
  } = {}) {
    const listedPaths = new Map(selectedApps.map((app) => [app.packageName, app.apkPath || null]))
    let bulkDetails = new Map()
    let strategy = 'bulk'
    let bulkFailure = null
    try {
      const output = await adb.runDevice(
        serial,
        ['shell', 'dumpsys', 'package', 'packages'],
        { signal, timeout: bulkDumpTimeout, maxBuffer: bulkDumpMaxBuffer },
      )
      bulkDetails = parsePackageDump(output, { currentUserId, enabledAccessibilityServices })
    } catch (error) {
      throwIfTerminal(error)
      bulkFailure = error
    }

    const selectedNames = new Set(selectedApps.map((app) => app.packageName))
    bulkDetails = new Map([...bulkDetails].filter(([packageName]) => selectedNames.has(packageName)))
    const missingApps = selectedApps.filter((app) => !bulkDetails.has(app.packageName))
    if (missingApps.length > 0) strategy = bulkDetails.size > 0 ? 'bulk_with_fallback' : 'per_package_fallback'
    const fallbackDetails = await mapWithConcurrency(missingApps, detailConcurrency, async (app) => {
      try {
        const output = await adb.runDevice(
          serial,
          ['shell', 'dumpsys', 'package', app.packageName],
          { signal, timeout: extendedTimeout },
        )
        return [app.packageName, parsePackageDetails(output, app.packageName, {
          currentUserId,
          enabledAccessibilityServices,
          listedApkPath: app.apkPath,
        })]
      } catch (error) {
        throwIfTerminal(error)
        return [app.packageName, {
          available: false,
          reason: error?.code || error?.codigo || 'PACKAGE_DETAILS_UNAVAILABLE',
          collection: availabilityFromError(error),
        }]
      }
    })

    const detailsByPackage = new Map(bulkDetails)
    fallbackDetails.forEach(([packageName, details]) => detailsByPackage.set(packageName, details))
    detailsByPackage.forEach((details, packageName) => {
      if (!details?.available) return
      const listedApkPath = listedPaths.get(packageName)
      if (!details.apkPath && validApkPath(listedApkPath)) details.apkPath = listedApkPath
    })

    return {
      detailsByPackage,
      collection: {
        status: detailsByPackage.size > 0 || selectedApps.length === 0 ? 'available' : 'error',
        strategy,
        bulkParsedPackages: bulkDetails.size,
        fallbackCommands: missingApps.length,
        bulkFailure: bulkFailure?.code || bulkFailure?.codigo || null,
      },
    }
  }

  async function listInstalledApps(serial, {
    currentUserOnly = false,
    includeSecurityDetails = false,
    detailTypes = null,
    types = ['user', 'system'],
    includeExtendedStates = false,
    includeHashes = false,
    hashPackageNames = null,
    signal = null,
    cache = null,
    currentUserId: suppliedCurrentUserId,
  } = {}) {
    const startedAt = Date.now()
    const userContext = suppliedCurrentUserId !== undefined
      ? { currentUserId: suppliedCurrentUserId }
      : await deviceCollector.collectAndroidUsers(serial, { signal, cache })
    const currentUserId = userContext.currentUserId ?? null
    if (currentUserOnly && (!Number.isInteger(currentUserId) || currentUserId < 0)) {
      throw createAdbError('ANDROID_USER_UNAVAILABLE', 'Não foi possível identificar o usuário Android atual.')
    }
    const userArgs = currentUserOnly ? ['--user', String(currentUserId)] : []
    const [userOutput, systemOutput] = await Promise.all([
      adb.runDevice(serial, ['shell', 'pm', 'list', 'packages', '-3', '-f', ...userArgs], { signal, timeout: extendedTimeout }),
      adb.runDevice(serial, ['shell', 'pm', 'list', 'packages', '-s', '-f', ...userArgs], { signal, timeout: extendedTimeout }),
    ])
    if (currentUserOnly) {
      for (const output of [userOutput, systemOutput]) {
        const lines = String(output).split(/\r?\n/).filter(line => line.trim())
        if (lines.some(line => !line.trim().startsWith('package:')) || parsePackageList(output).length !== lines.length) {
          throw createAdbError('APPS_UNAVAILABLE', 'O Android não retornou uma lista de aplicativos válida.')
        }
      }
      const latest = await deviceCollector.collectAndroidUsers(serial, { signal })
      if (latest.currentUserId !== currentUserId) throw createAdbError('ANDROID_USER_CHANGED', 'O usuário Android mudou durante a consulta.')
    }
    const userApps = parsePackageList(userOutput, 'user')
    const systemApps = parsePackageList(systemOutput, 'system')
    const appsByPackage = new Map()
    ;[...userApps, ...systemApps].forEach((app) => {
      if (!appsByPackage.has(app.packageName) || app.type === 'user') appsByPackage.set(app.packageName, app)
    })
    const normalizedTypes = Array.isArray(types) ? types.filter((type) => ['user', 'system'].includes(type)) : ['user', 'system']
    let apps = [...appsByPackage.values()]
      .filter((app) => normalizedTypes.includes(app.type))
      .sort((a, b) => a.packageName.localeCompare(b.packageName))
    const normalizedDetailTypes = Array.isArray(detailTypes)
      ? detailTypes.filter((type) => ['user', 'system'].includes(type))
      : includeSecurityDetails ? ['user'] : []
    const stateCollection = {
      disabled: { status: 'not_available', reason: 'NOT_REQUESTED', packages: [] },
      suspended: { status: 'not_available', reason: 'NOT_REQUESTED', packages: [] },
    }
    if (includeExtendedStates) {
      for (const [key, args] of [
        ['disabled', ['shell', 'pm', 'list', 'packages', '-d', ...userArgs]],
        ['suspended', ['shell', 'pm', 'list', 'packages', '--suspended', ...userArgs]],
      ]) {
        try {
          const output = await adb.runDevice(serial, args, { signal, timeout: extendedTimeout })
          const lines = String(output).split(/\r?\n/).filter(line => line.trim())
          if (lines.some(line => !line.trim().startsWith('package:')) || parsePackageList(output).length !== lines.length) {
            stateCollection[key] = { status: 'not_available', reason: 'INVALID_RESPONSE', packages: [] }
            continue
          }
          stateCollection[key] = { status: 'available', reason: null, packages: parsePackageList(output).map((app) => app.packageName) }
        } catch (error) {
          throwIfTerminal(error)
          stateCollection[key] = { ...availabilityFromError(error), packages: [] }
        }
      }
      const disabled = new Set(stateCollection.disabled.packages)
      const suspended = new Set(stateCollection.suspended.packages)
      apps = apps.map((app) => ({
        ...app,
        enabled: stateCollection.disabled.status === 'available' ? !disabled.has(app.packageName) : null,
        suspended: stateCollection.suspended.status === 'available' ? suspended.has(app.packageName) : null,
      }))
    }
    let detailsCollectionDurationMs = null
    let detailsCollection = { status: 'not_available', reason: 'DETAILS_NOT_REQUESTED' }
    let appOpsCollection = null
    let hashCollection = { status: 'not_available', reason: 'HASH_DEFERRED', commandCount: 0 }

    const detailedApps = apps.filter((app) => normalizedDetailTypes.includes(app.type))
    if (detailedApps.length > 0) {
      const detailsStartedAt = Date.now()
      const [accessibility, appOps] = await Promise.all([
        securityCollector.collectAccessibilityServices(serial, { signal, cache }),
        securityCollector.collectAppOps(serial, { signal, cache }),
      ])
      appOpsCollection = appOps
      const collected = await collectPackageDetails(serial, detailedApps, {
        signal,
        currentUserId,
        enabledAccessibilityServices: accessibility.value,
      })
      collected.detailsByPackage.forEach((details, packageName) => {
        collected.detailsByPackage.set(packageName, applySpecialCapabilityStates(details, packageName, appOps))
      })
      if (includeHashes) {
        hashCollection = await collectHashes(serial, collected.detailsByPackage, {
          signal,
          packageNames: Array.isArray(hashPackageNames) ? hashPackageNames : null,
        })
      }
      apps = apps.map((app) => normalizedDetailTypes.includes(app.type)
        ? { ...app, securityDetails: collected.detailsByPackage.get(app.packageName) || { available: false, reason: 'PACKAGE_DETAILS_UNAVAILABLE' } }
        : app)
      detailsCollectionDurationMs = Date.now() - detailsStartedAt
      detailsCollection = collected.collection
    }

    return {
      total: apps.length,
      userTotal: apps.filter((app) => app.type === 'user').length,
      systemTotal: apps.filter((app) => app.type === 'system').length,
      items: apps,
      analysis: {
        found: apps.length,
        basicAnalyzed: apps.length,
        detailedRequested: detailedApps.length,
        detailedAnalyzed: apps.filter((app) => app.securityDetails?.available).length,
      },
      currentUserId,
      detailsCollectionDurationMs,
      collection: {
        status: 'available',
        listCommands: includeExtendedStates ? 4 : 2,
        details: detailsCollection,
        appOps: appOpsCollection,
        hash: hashCollection,
        states: stateCollection,
        durationMs: Date.now() - startedAt,
      },
    }
  }

  return { collectHashes, collectPackageDetails, listInstalledApps }
}

module.exports = { createPackageCollector, mapWithConcurrency, throwIfTerminal }
