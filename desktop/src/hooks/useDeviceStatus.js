import { useCallback, useState, useEffect } from 'react'

function normalizarDispositivo(estado) {
  if (!estado) {
    return { status: 'waiting' }
  }

  return {
    ...estado,

    bateria:
      estado.battery?.level ??
      estado.bateria ??
      null,

    versaoAndroid:
      estado.androidVersion ??
      estado.versaoAndroid ??
      null,
  }
}

function useDeviceStatus() {
  const [dispositivo, setDispositivo] = useState({
    status: 'waiting',
  })

  useEffect(() => {
    if (!window.diagpro) return

    let ativo = true

    window.diagpro
      .getDeviceStatus()
      .then((estado) => {
        if (ativo) {
          setDispositivo(normalizarDispositivo(estado))
        }
      })
      .catch(() => {})

    const unsubscribe = window.diagpro.onDeviceStatus(
      (estado) => {
        if (ativo) {
          setDispositivo(
            normalizarDispositivo(estado)
          )
        }
      }
    )

    return () => {
      ativo = false
      unsubscribe()
    }
  }, [])

  const selectDevice = useCallback(async (serial) => {
    if (!window.diagpro?.selectDevice) return { ok: false, code: 'ADB_UNAVAILABLE' }
    const response = await window.diagpro.selectDevice(serial)
    if (response?.ok && response.data) setDispositivo(normalizarDispositivo(response.data))
    return response
  }, [])

  const reconnect = useCallback(async () => {
    if (!window.diagpro?.getDeviceStatus) return { status: 'adb_unavailable' }
    const response = normalizarDispositivo(await window.diagpro.getDeviceStatus())
    setDispositivo(response)
    return response
  }, [])

  return { ...dispositivo, selectDevice, reconnect }
}

export default useDeviceStatus
