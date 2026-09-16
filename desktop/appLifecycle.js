function configureSingleInstance({ app, getWindow }) {
  const acquired = app.requestSingleInstanceLock()
  if (!acquired) {
    app.quit()
    return false
  }

  app.on('second-instance', () => {
    const window = getWindow()
    if (!window || window.isDestroyed()) return
    if (window.isMinimized()) window.restore()
    window.show()
    window.focus()
  })
  return true
}

function registerFatalErrorHandlers(processObject, { log, notify }) {
  const handle = (event) => (error) => {
    log(event, { code: error?.code || error?.name || 'UNEXPECTED_ERROR' })
    notify()
  }
  processObject.on('uncaughtException', handle('uncaught_exception'))
  processObject.on('unhandledRejection', handle('unhandled_rejection'))
}

function createShutdownManager({ coordinator, getGoogleController, getMonitorController, clearPolling }) {
  let shuttingDown = false
  return {
    isShuttingDown: () => shuttingDown,
    shutdown() {
      if (shuttingDown) return []
      shuttingDown = true
      clearPolling()
      const googleController = getGoogleController()
      if (googleController && !googleController.signal.aborted) googleController.abort()
      const monitorController = getMonitorController()
      if (monitorController && !monitorController.signal.aborted) monitorController.abort()
      return coordinator.cancelAll()
    },
  }
}

module.exports = { configureSingleInstance, createShutdownManager, registerFatalErrorHandlers }
