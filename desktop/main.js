const { app, BrowserWindow, dialog, ipcMain, Menu, shell, safeStorage } = require('electron')
const { createSessionVault } = require('./sessionVault')
const crypto = require('crypto')
const fs = require('fs')
const path = require('path')
const { ADB_ERROR_CODES } = require('./adb/adbErrors')
const { createScanCoordinator } = require('./adb/scanCoordinator')
const { createConnectionAssistant, pollDelayForState } = require('./adb/connectionAssistant')
const { configureSingleInstance, createShutdownManager, registerFatalErrorHandlers } = require('./appLifecycle')
const { createMaintenanceService } = require('./adb/maintenanceService')
const maintenanceService = createMaintenanceService()
const { isTrustedRendererUrl } = require('./electronPolicy')
const { isMercadoPagoCheckoutUrl } = require('./payments/checkout')
const { createProductionLogger } = require('./productionLogger')
const { rendererTarget } = require('./rendererTarget')
const { runGoogleDesktopAuth } = require('./googleAuth')
const { buildSupportDiagnostic } = require('./supportDiagnostic')
const {
  verificarEstado,
  cancelarRemediacao,
  coletarDiagnostico,
  desinstalarAppUsuario,
  executarScan,
  iniciarServidorAdb,
  listarAppsInstalados,
  obterPreviewRemocao,
  reconectarDispositivo,
  verificarAdb,
} = require('./deviceDetector')

let mainWindow
let estadoAtual = { status: 'waiting' }
let ultimoEstadoJSON = null
let verificacaoAtual = null
let selectedDeviceSerial = null
let devicePollingTimer = null
let rendererTargetInfo = null
let productionLogger = null
const scanCoordinator = createScanCoordinator()
const connectionAssistant = createConnectionAssistant()
const forceLocalBuild = process.argv.includes('--local-build')
let googleAuthController = null
const lifecycleController = new AbortController()

const shutdownManager = createShutdownManager({
  coordinator: scanCoordinator,
  getGoogleController: () => googleAuthController,
  getMonitorController: () => lifecycleController,
  clearPolling: () => {
    if (devicePollingTimer) clearTimeout(devicePollingTimer)
    devicePollingTimer = null
  },
})

const primaryInstance = configureSingleInstance({ app, getWindow: () => mainWindow })

registerFatalErrorHandlers(process, {
  log: (event, details) => logOperationalError(event, details),
  notify: () => {
    if (app.isReady()) dialog.showErrorBox('Erro inesperado', 'O DiagPro encontrou um erro inesperado. Reinicie o aplicativo.')
  },
})

function logOperationalError(event, details = {}) {
  productionLogger?.error(event, details)
}

function readRecentSafeLogs(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8').split(/\r?\n/).filter(Boolean).slice(-30).map((line) => {
      try { return JSON.parse(line) } catch { return null }
    }).filter(Boolean)
  } catch {
    return []
  }
}

function trustedIpcHandler(channel, handler) {
  ipcMain.handle(channel, async (event, ...args) => {
    const senderUrl = event.senderFrame?.url || event.sender.getURL()
    const trusted = mainWindow
      && !mainWindow.isDestroyed()
      && event.sender === mainWindow.webContents
      && event.senderFrame === event.sender.mainFrame
      && isTrustedRendererUrl(senderUrl, rendererTargetInfo)
    if (!trusted) {
      logOperationalError('ipc_rejected', { code: 'UNTRUSTED_RENDERER' })
      throw new Error('Solicitação IPC não autorizada.')
    }
    return handler(event, ...args)
  })
}

function validScanId(scanId) {
  return typeof scanId === 'string' && /^[A-Za-z0-9-]{8,80}$/.test(scanId)
}

function acquireDeviceOperation(serial, type, id, options = {}) {
  return scanCoordinator.beginOperation(serial, type, id, options)
}

function releaseDeviceOperation(serial, id) {
  scanCoordinator.finishOperation(serial, id)
}

function deviceBusyResponse(serial) {
  const active = scanCoordinator.getOperation(serial)
  return {
    ok: false,
    code: 'DEVICE_BUSY',
    message: active?.type === 'scan'
      ? 'Já existe uma análise em andamento neste dispositivo.'
      : 'Já existe uma operação ADB em andamento neste dispositivo.',
  }
}

function abortDisconnectedOperations(deviceState) {
  scanCoordinator.abortDisconnected(deviceState)
}

function createWindow() {
  rendererTargetInfo = rendererTarget({
    packaged: app.isPackaged,
    forceLocalBuild,
    appDirectory: __dirname,
    devServerUrl: process.env.DIAGPRO_RENDERER_URL,
  })
  const iconDirectory = rendererTargetInfo.kind === 'file' ? 'dist' : 'public'
  if (rendererTargetInfo.kind === 'file') Menu.setApplicationMenu(null)

  mainWindow = new BrowserWindow({
    title: 'DiagPro',
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    autoHideMenuBar: true,
    icon: path.join(__dirname, iconDirectory, 'logo.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      devTools: rendererTargetInfo.kind === 'url',
    },
  })

  // Abre o DiagPro maximizado
  mainWindow.maximize()

  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  mainWindow.webContents.on('will-navigate', (event, navigationUrl) => {
    if (!isTrustedRendererUrl(navigationUrl, rendererTargetInfo)) {
      event.preventDefault()
      logOperationalError('renderer_navigation_blocked', { code: 'UNTRUSTED_URL' })
    }
  })

  const permissionSession = mainWindow.webContents.session
  permissionSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false))
  permissionSession.setPermissionCheckHandler(() => false)

  let showingLoadFailure = false
  mainWindow.webContents.on('did-fail-load', (_event, errorCode, _description, _url, isMainFrame) => {
    if (!isMainFrame || showingLoadFailure) return
    showingLoadFailure = true
    logOperationalError('renderer_load_failed', { code: errorCode })
    const errorPage = encodeURIComponent(`<!doctype html>
      <html lang="pt-BR"><head><meta charset="UTF-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'">
      <style>body{margin:0;display:grid;place-items:center;height:100vh;background:#080f1c;color:#dce9f6;font-family:Segoe UI,sans-serif}.box{max-width:520px;padding:32px;border:1px solid #29415e;border-radius:14px;background:#101c2c}h1{font-size:22px}p{color:#9db4cc;line-height:1.55}</style></head>
      <body><main class="box"><h1>O DiagPro não pôde abrir a interface</h1><p>Feche e abra o aplicativo novamente. Se o problema continuar, consulte o arquivo de log do DiagPro.</p></main></body></html>`)
    mainWindow.loadURL(`data:text/html;charset=UTF-8,${errorPage}`)
  })
  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    logOperationalError('renderer_process_gone', { reason: details.reason, exitCode: details.exitCode })
  })
  mainWindow.webContents.on('preload-error', () => logOperationalError('preload_failed', { code: 'PRELOAD_ERROR' }))

  productionLogger?.info('renderer_loading', { targetKind: rendererTargetInfo.kind })
  const loading = rendererTargetInfo.kind === 'file'
    ? mainWindow.loadFile(rendererTargetInfo.value)
    : mainWindow.loadURL(rendererTargetInfo.value)
  loading.catch(() => logOperationalError('renderer_load_failed', { code: 'LOAD_REJECTED' }))

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}


async function monitorarDispositivo() {
  if (verificacaoAtual) return verificacaoAtual

  verificacaoAtual = verificarEstado({ selectedSerial: selectedDeviceSerial, signal: lifecycleController.signal })
    .then(async (estado) => {
      if (estado.status === 'multiple' && selectedDeviceSerial
        && !estado.devices?.some((device) => device.serial === selectedDeviceSerial)) {
        selectedDeviceSerial = null
      }
      connectionAssistant.observe(estado)
      estadoAtual = estado
      abortDisconnectedOperations(estado)
      const estadoJSON = JSON.stringify(estado)

      if (estadoJSON !== ultimoEstadoJSON) {
        ultimoEstadoJSON = estadoJSON
        productionLogger?.info('adb_state_changed', { state: estado.connectionState || estado.status })
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('device-status-changed', estado)
        }
      }

      const reconnect = estado.serial && !scanCoordinator.getOperation(estado.serial)
        ? connectionAssistant.nextReconnect(estado)
        : null
      if (reconnect) {
        try {
          await reconectarDispositivo(reconnect.serial, { signal: lifecycleController.signal })
          productionLogger?.info('adb_reconnect_requested', { attempt: reconnect.attempt })
        } catch (error) {
          logOperationalError('adb_reconnect_failed', { code: error?.codigo || error?.code || 'ADB_RECONNECT_FAILED' })
        }
      }

      return estado
    })
    .finally(() => {
      verificacaoAtual = null
    })

  return verificacaoAtual
}

trustedIpcHandler('get-device-status', () => monitorarDispositivo())
const sessionVault = () => createSessionVault({ directory: app.getPath('userData'), safeStorage })
trustedIpcHandler('session-read', () => sessionVault().read())
trustedIpcHandler('session-save', (_event, payload) => sessionVault().save(payload || {}))
trustedIpcHandler('session-clear', () => sessionVault().clear())

trustedIpcHandler('get-app-info', () => ({
  name: app.getName(),
  version: app.getVersion(),
  packaged: app.isPackaged,
  operatingSystem: {
    platform: process.platform,
    architecture: process.arch,
    version: process.getSystemVersion(),
    label: process.platform === 'win32' ? `Windows ${process.getSystemVersion()}` : process.platform,
  },
}))

trustedIpcHandler('get-startup-settings', () => {
  const supported = process.platform === 'win32' && app.isPackaged
  return { supported, enabled: supported ? app.getLoginItemSettings().openAtLogin === true : false }
})

trustedIpcHandler('set-startup-settings', (_event, { enabled } = {}) => {
  const supported = process.platform === 'win32' && app.isPackaged
  if (!supported || typeof enabled !== 'boolean') return { supported, enabled: false }
  app.setLoginItemSettings({ openAtLogin: enabled, path: process.execPath })
  return { supported: true, enabled: app.getLoginItemSettings().openAtLogin === true }
})

trustedIpcHandler('export-support-diagnostic', async (_event, payload = {}) => {
  const diagnostic = buildSupportDiagnostic({
    payload,
    runtime: {
      generatedAt: new Date().toISOString(),
      version: app.getVersion(),
      packaged: app.isPackaged,
      platform: process.platform,
      osVersion: process.getSystemVersion(),
      architecture: process.arch,
    },
    logs: readRecentSafeLogs(productionLogger?.filePath),
  })
  const date = new Date().toISOString().slice(0, 10)
  const selection = await dialog.showSaveDialog(mainWindow, {
    title: 'Exportar diagnóstico técnico do DiagPro',
    defaultPath: path.join(app.getPath('documents'), `diagpro-diagnostico-tecnico-${date}.json`),
    filters: [{ name: 'Diagnóstico técnico JSON', extensions: ['json'] }],
  })
  if (selection.canceled || !selection.filePath) return { ok: false, code: 'CANCELED' }
  try {
    await fs.promises.writeFile(selection.filePath, `${JSON.stringify(diagnostic, null, 2)}\n`, { encoding: 'utf8', flag: 'w' })
    productionLogger?.info('support_diagnostic_exported', { type: 'sanitized' })
    return { ok: true }
  } catch {
    logOperationalError('support_diagnostic_export_failed', { code: 'WRITE_FAILED' })
    return { ok: false, code: 'WRITE_FAILED' }
  }
})

trustedIpcHandler('select-device', async (_event, { serial } = {}) => {
  try {
    selectedDeviceSerial = connectionAssistant.validateSelection(serial, estadoAtual.devices || [])
    ultimoEstadoJSON = null
    if (verificacaoAtual) await verificacaoAtual.catch(() => {})
    return { ok: true, data: await monitorarDispositivo() }
  } catch (error) {
    return { ok: false, code: error.code || 'INVALID_DEVICE', message: error.message }
  }
})

trustedIpcHandler('create-scan-id', () => crypto.randomUUID())

trustedIpcHandler('client-event', (_event, payload = {}) => {
  if (payload?.event === 'api_unavailable') logOperationalError('api_unavailable', { code: 'NETWORK_ERROR' })
  if (payload?.event === 'diagnostic_persistence_failed') {
    const code = /^(?:HTTP_(?:400|401|403|409|413|429|500|502|503)|NETWORK_ERROR)$/.test(payload?.code)
      ? payload.code
      : 'UNKNOWN_ERROR'
    logOperationalError('diagnostic_persistence_failed', { code })
  }
})

trustedIpcHandler('google-auth-start', async (_event, { apiBaseUrl } = {}) => {
  if (googleAuthController) {
    return { ok: false, code: 'google_auth_in_progress', message: 'Um login com Google já está em andamento.' }
  }
  googleAuthController = new AbortController()
  try {
    const session = await runGoogleDesktopAuth({
      apiBaseUrl,
      openExternal: (url) => shell.openExternal(url),
      signal: googleAuthController.signal,
    })
    return { ok: true, access: session.access, refresh: session.refresh, username: session.username }
  } catch (error) {
    const allowedCodes = new Set([
      'account_link_required', 'account_not_authorized', 'backend_unavailable',
      'auth_temporarily_unavailable', 'email_not_verified', 'flow_already_used',
      'flow_expired', 'google_auth_in_progress', 'google_not_configured',
      'google_unavailable', 'invalid_authorization_url', 'invalid_backend_response',
      'invalid_google_token', 'invalid_nonce', 'invalid_request', 'login_canceled',
    ])
    return {
      ok: false,
      code: allowedCodes.has(error?.code) ? error.code : 'google_auth_failed',
      message: 'Não foi possível concluir o login com Google.',
    }
  } finally {
    googleAuthController = null
  }
})

trustedIpcHandler('google-auth-cancel', () => {
  if (!googleAuthController) return { ok: false, code: 'google_auth_not_running' }
  googleAuthController.abort()
  return { ok: true }
})

trustedIpcHandler('check-adb', async () => {
  try {
    const [adb, device] = await Promise.all([
      verificarAdb({ signal: lifecycleController.signal }),
      monitorarDispositivo(),
    ])
    return { ok: true, data: { adb, device } }
  } catch (err) {
    const messages = {
      ADB_NOT_FOUND: 'O ADB não foi localizado neste computador.',
      ADB_TIMEOUT: 'O ADB demorou para responder.',
    }
    return {
      ok: false,
      code: err.codigo || 'ADB_UNAVAILABLE',
      message: messages[err.codigo] || 'Não foi possível executar o ADB neste computador.',
    }
  }
})

trustedIpcHandler('run-diagnostic', async (_event, { serial } = {}) => {
  const operationId = crypto.randomUUID()
  const controller = new AbortController()
  if (!acquireDeviceOperation(serial, 'scan', operationId, { controller })) return { sucesso: false, mensagem: deviceBusyResponse(serial).message }
  try {
    const dados = await coletarDiagnostico(serial, { signal: controller.signal })
    return { sucesso: true, dados }
  } catch (err) {
    return { sucesso: false, mensagem: 'Não foi possível coletar o diagnóstico. Verifique a conexão do dispositivo.' }
  } finally {
    releaseDeviceOperation(serial, operationId)
  }
})

trustedIpcHandler('start-scan', async (_event, { serial, mode, modules, scanId: requestedScanId } = {}) => {
  const scanId = validScanId(requestedScanId) ? requestedScanId : crypto.randomUUID()
  const controller = new AbortController()
  const started = scanCoordinator.beginScan({ scanId, serial, controller })
  if (!started.ok) {
    return started.code === 'SCAN_ALREADY_EXISTS'
      ? { ok: false, scanId, code: started.code, message: 'Este identificador de análise já está em uso.' }
      : { ...deviceBusyResponse(serial), scanId }
  }
  try {
    productionLogger?.info('scan_started', { mode, moduleCount: Array.isArray(modules) ? modules.length : 0 })
    const dados = await executarScan(serial, {
      mode,
      modules,
      scanId,
      signal: controller.signal,
      onProgress: (progresso) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('scan-progress', { ...progresso, scanId })
        }
      },
    })
    for (const root of dados.files?.rootDiagnostics || []) {
      productionLogger?.info('file_root_checked', {
        root: root.path,
        state: root.enumerationStatus || root.status,
        errorType: root.errorType,
        exitCode: root.exitCode,
        durationMs: root.durationMs,
        found: root.found,
      })
    }
    productionLogger?.info('scan_finished', { state: dados.status, mode })
    return { ok: true, scanId, status: dados.status, data: dados }
  } catch (err) {
    return {
      ok: false,
      scanId,
      status: err.scanStatus || (err.codigo === ADB_ERROR_CODES.SCAN_ABORTED ? 'canceled' : 'failed'),
      code: err.codigo || err.code || 'SCAN_FAILED',
      message: err.message,
    }
  } finally {
    scanCoordinator.finishScan(scanId)
  }
})

trustedIpcHandler('cancel-scan', async (_event, { scanId } = {}) => {
  const scan = scanCoordinator.getScan(scanId)
  if (!scan) return { ok: false, scanId, code: 'SCAN_NOT_FOUND', message: 'A análise não está mais em execução.' }
  scanCoordinator.cancelScan(scanId)
  return { ok: true, scanId, status: 'cancel_requested' }
})

trustedIpcHandler('inspect-quick-action', async (_event, { serial, action, operationId } = {}) => {
  if (!validScanId(operationId)) {
    return { ok: false, code: 'INVALID_OPERATION', message: 'A identificação da consulta é inválida.' }
  }
  const controller = new AbortController()
  if (!scanCoordinator.beginOperation(serial, 'maintenance', operationId, { controller })) return deviceBusyResponse(serial)
  const startedAt = Date.now()
  const loggedAction = ['cleanup', 'optimization', 'battery', 'backup'].includes(action) ? action : 'invalid'
  productionLogger?.info('quick_action_started', { action: loggedAction })
  try {
    const data = await maintenanceService.inspect({ serial, action, signal: controller.signal })
    productionLogger?.info('quick_action_finished', {
      action: loggedAction,
      state: data.coverage,
      durationMs: Date.now() - startedAt,
    })
    return { ok: true, operationId, data }
  } catch (error) {
    productionLogger?.error('quick_action_failed', {
      action: loggedAction,
      code: error.code || 'MAINTENANCE_FAILED',
      errorType: error.constructor?.name || 'Error',
      durationMs: Date.now() - startedAt,
    })
    return { ok: false, code: error.code || 'MAINTENANCE_FAILED', message: error.message || 'Não foi possível consultar o dispositivo.' }
  } finally {
    releaseDeviceOperation(serial, operationId)
  }
})

trustedIpcHandler('cancel-quick-action', async (_event, { serial, operationId } = {}) => {
  if (!validScanId(operationId)) {
    return { ok: false, code: 'INVALID_OPERATION', message: 'A identificação da consulta é inválida.' }
  }
  const operation = scanCoordinator.getOperationById(operationId)
  if (!operation || operation.type !== 'maintenance' || operation.serial !== serial) {
    return { ok: false, code: 'OPERATION_NOT_FOUND', message: 'A consulta não está mais em execução.' }
  }
  scanCoordinator.cancelOperation(operationId)
  return { ok: true, operationId, status: 'cancel_requested' }
})

trustedIpcHandler('get-installed-apps', async (_event, { serial } = {}) => {
  const operationId = crypto.randomUUID()
  const controller = new AbortController()
  if (!acquireDeviceOperation(serial, 'apps', operationId, { controller })) return deviceBusyResponse(serial)
  try {
    return {
      ok: true,
      data: await listarAppsInstalados(serial, {
        signal: controller.signal,
        currentUserOnly: true,
        includeExtendedStates: true,
        includeSecurityDetails: true,
        detailTypes: ['user', 'system'],
      }),
    }
  } catch (err) {
    return { ok: false, code: err.codigo || 'APPS_UNAVAILABLE', message: err.message }
  } finally {
    releaseDeviceOperation(serial, operationId)
  }
})

trustedIpcHandler('get-removal-preview', async (_event, {
  serial, packageName, finding, action, projectionId,
} = {}) => {
  const operationId = crypto.randomUUID()
  const controller = new AbortController()
  if (!acquireDeviceOperation(serial, 'removal_preview', operationId, { controller })) return deviceBusyResponse(serial)
  try {
    return {
      ok: true,
      ...await obterPreviewRemocao({ serial, packageName, finding, action, projectionId, signal: controller.signal }),
    }
  } catch (err) {
    return { ok: false, code: err.codigo || 'REMOVAL_PREVIEW_FAILED', message: err.message }
  } finally {
    releaseDeviceOperation(serial, operationId)
  }
})

trustedIpcHandler('uninstall-user-app', async (_event, {
  serial, packageName, androidUserId, confirmationToken, actionId, findingId, projectionId,
} = {}) => {
  if (typeof actionId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(actionId)) {
    return { ok: false, code: 'INVALID_ACTION', message: 'Abra um novo preview antes de executar a correção.' }
  }
  const controller = new AbortController()
  if (!scanCoordinator.beginOperation(serial, 'remediation', actionId, { controller, packageName })) {
    return deviceBusyResponse(serial)
  }
  try {
    return await desinstalarAppUsuario({
      serial,
      packageName,
      androidUserId,
      confirmationToken,
      actionId,
      findingId,
      projectionId,
      signal: controller.signal,
      onTransition: (transition) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('remediation-progress', transition)
        }
      },
    })
  } catch (err) {
    return { ok: false, code: err.codigo || 'UNINSTALL_FAILED', message: err.message }
  } finally {
    releaseDeviceOperation(serial, actionId)
  }
})

trustedIpcHandler('cancel-remediation', async (_event, { actionId, confirmationToken } = {}) => {
  if (scanCoordinator.cancelOperation(actionId)) {
    return { ok: true, actionId, status: 'cancel_requested' }
  }
  if (cancelarRemediacao(actionId, confirmationToken)) {
    return { ok: true, actionId, status: 'canceled' }
  }
  return { ok: false, actionId, code: 'REMEDIATION_NOT_FOUND', message: 'A correção não está mais pendente.' }
})

trustedIpcHandler('open-external-checkout', async (_event, { url } = {}) => {
  if (!isMercadoPagoCheckoutUrl(url)) {
    return { ok: false, code: 'INVALID_CHECKOUT_URL', message: 'O endereço de checkout não é permitido.' }
  }
  try {
    await shell.openExternal(url)
    return { ok: true }
  } catch {
    return { ok: false, code: 'CHECKOUT_OPEN_FAILED', message: 'Não foi possível abrir o checkout externo.' }
  }
})

if (primaryInstance) app.whenReady().then(async () => {
  try {
    productionLogger = createProductionLogger({ directory: path.join(app.getPath('userData'), 'logs') })
    productionLogger.info('startup', { packaged: app.isPackaged, version: app.getVersion() })
  } catch { /* A falha de logs não impede a inicialização. */ }
  createWindow()
  try {
    await iniciarServidorAdb({ signal: lifecycleController.signal })
  } catch (error) {
    logOperationalError('adb_start_server_failed', { code: error?.codigo || error?.code || 'ADB_UNAVAILABLE' })
  }
  const poll = async () => {
    try {
      await monitorarDispositivo()
    } catch {
      logOperationalError('adb_unavailable', { code: 'ADB_UNAVAILABLE' })
    } finally {
      if (!shutdownManager.isShuttingDown()) devicePollingTimer = setTimeout(poll, pollDelayForState(estadoAtual))
    }
  }
  void poll()
})

app.on('before-quit', () => shutdownManager.shutdown())

app.on('window-all-closed', () => {
  shutdownManager.shutdown()
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
