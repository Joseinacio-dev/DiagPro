import { useCallback, useEffect, useRef, useState } from 'react'
import { API_BASE_URL } from '../config/api.js'
import { checkApiHealth } from '../utils/serviceHealth.mjs'

function useStartupStatus() {
  const [api, setApi] = useState({ status: 'checking', attempts: 0 })
  const [appInfo, setAppInfo] = useState({ name: 'DiagPro', version: null, packaged: false })
  const requestRef = useRef(null)

  const checkApi = useCallback(async () => {
    requestRef.current?.abort()
    const controller = new AbortController()
    requestRef.current = controller
    setApi({ status: 'checking', attempts: 0 })
    try {
      const result = await checkApiHealth({ apiBaseUrl: API_BASE_URL, signal: controller.signal })
      if (!controller.signal.aborted) setApi(result)
      return result
    } catch {
      if (!controller.signal.aborted) setApi({ status: 'offline', attempts: 0, code: 'UNAVAILABLE' })
      return null
    }
  }, [])

  useEffect(() => {
    let active = true
    window.diagpro?.getAppInfo?.().then((info) => {
      if (active && info) setAppInfo(info)
    }).catch(() => {})
    void checkApi()
    return () => {
      active = false
      requestRef.current?.abort()
    }
  }, [checkApi])

  return { api, appInfo, checkApi }
}

export default useStartupStatus
