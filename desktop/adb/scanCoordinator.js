const { ADB_ERROR_CODES, createAdbError } = require('./adbErrors')

function createScanCoordinator() {
  const scans = new Map()
  const operationsBySerial = new Map()

  function beginOperation(serial, type, id, { controller = null, packageName = null } = {}) {
    if (typeof serial !== 'string' || !serial || operationsBySerial.has(serial)) return false
    operationsBySerial.set(serial, { serial, type, id, controller, packageName })
    return true
  }

  function finishOperation(serial, id) {
    if (operationsBySerial.get(serial)?.id === id) operationsBySerial.delete(serial)
  }

  function beginScan({ scanId, serial, controller }) {
    if (scans.has(scanId)) return { ok: false, code: 'SCAN_ALREADY_EXISTS' }
    if (!beginOperation(serial, 'scan', scanId, { controller })) return { ok: false, code: 'DEVICE_BUSY' }
    scans.set(scanId, { scanId, serial, controller })
    return { ok: true }
  }

  function finishScan(scanId) {
    const scan = scans.get(scanId)
    if (!scan) return false
    scans.delete(scanId)
    finishOperation(scan.serial, scanId)
    return true
  }

  function cancelScan(scanId, reason = createAdbError(ADB_ERROR_CODES.SCAN_ABORTED)) {
    const scan = scans.get(scanId)
    if (!scan) return false
    if (!scan.controller.signal.aborted) scan.controller.abort(reason)
    return true
  }

  function cancelOperation(id, reason = createAdbError(ADB_ERROR_CODES.OPERATION_CANCELED)) {
    const operation = [...operationsBySerial.values()].find((item) => item.id === id)
    if (!operation?.controller) return false
    if (!operation.controller.signal.aborted) operation.controller.abort(reason)
    return true
  }

  function abortDisconnected(deviceState) {
    const connectedSerials = new Set(
      (Array.isArray(deviceState?.devices) ? deviceState.devices : [])
        .filter((device) => device.status === 'device')
        .map((device) => device.serial),
    )
    const aborted = []
    operationsBySerial.forEach((operation) => {
      if (!connectedSerials.has(operation.serial) && cancelOperation(
        operation.id,
        createAdbError(ADB_ERROR_CODES.DEVICE_DISCONNECTED),
      )) aborted.push(operation.id)
    })
    return aborted
  }

  function cancelAll(reason = createAdbError(ADB_ERROR_CODES.OPERATION_CANCELED)) {
    const canceled = []
    operationsBySerial.forEach((operation) => {
      if (cancelOperation(operation.id, reason)) canceled.push(operation.id)
    })
    return canceled
  }

  return {
    abortDisconnected,
    beginOperation,
    beginScan,
    cancelAll,
    cancelOperation,
    cancelScan,
    finishOperation,
    finishScan,
    getOperation: (serial) => operationsBySerial.get(serial) || null,
    getOperationById: (id) => [...operationsBySerial.values()].find((item) => item.id === id) || null,
    getScan: (scanId) => scans.get(scanId) || null,
  }
}

module.exports = { createScanCoordinator }
