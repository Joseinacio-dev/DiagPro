import { useMemo, useState } from 'react'
import { Activity, AlertTriangle, CheckCircle2, Download, Loader2, RefreshCw } from 'lucide-react'
import { buildSupportContext } from '../utils/supportContext.mjs'
import './SupportDiagnostic.css'

function label(value, labels) { return labels[value] || 'Não disponível' }

function SupportDiagnostic({ startupStatus, device, scanSession, compact = false }) {
  const [adbCheck, setAdbCheck] = useState({ status: 'idle', data: null })
  const [exportState, setExportState] = useState({ status: 'idle', message: '' })
  const context = useMemo(() => buildSupportContext({ device, scanSession }), [device, scanSession])
  const api = startupStatus?.api?.status || 'unavailable'
  const appInfo = startupStatus?.appInfo || {}

  async function checkAdb() {
    setAdbCheck({ status: 'checking', data: null })
    try {
      const response = await window.diagpro?.checkAdb?.()
      setAdbCheck(response?.ok ? { status: 'ready', data: response.data } : { status: 'error', data: null })
    } catch {
      setAdbCheck({ status: 'error', data: null })
    }
  }

  async function exportDiagnostic() {
    if (typeof window.diagpro?.exportSupportDiagnostic !== 'function') {
      setExportState({ status: 'error', message: 'Exportação disponível somente no aplicativo desktop.' })
      return
    }
    setExportState({ status: 'saving', message: '' })
    try {
      const response = await window.diagpro.exportSupportDiagnostic({
        api: { status: api },
        adb: {
          status: adbCheck.data?.device?.status || context.device.status,
          available: adbCheck.data?.adb?.available === true,
          version: adbCheck.data?.adb?.version,
        },
        device: context.device,
        scan: context.scan,
      })
      if (response?.ok) setExportState({ status: 'saved', message: 'Diagnóstico técnico exportado com segurança.' })
      else if (response?.code === 'CANCELED') setExportState({ status: 'idle', message: '' })
      else setExportState({ status: 'error', message: 'Não foi possível exportar o diagnóstico técnico.' })
    } catch {
      setExportState({ status: 'error', message: 'Não foi possível exportar o diagnóstico técnico.' })
    }
  }

  return <div className={`support-diagnostic ${compact ? 'compact' : ''}`}>
    <div className="support-diagnostic-grid">
      <div><span>Versão do DiagPro</span><strong>{appInfo.version || 'Não informada'}</strong></div>
      <div><span>Estado da API</span><strong>{label(api, { online: 'Online', checking: 'Conectando…', offline: 'Indisponível' })}</strong></div>
      <div><span>Estado do ADB</span><strong>{label(context.device.status, { connected: 'Conectado', authorized: 'Autorizado', waiting: 'Aguardando dispositivo', unauthorized: 'Não autorizado', offline: 'Offline', multiple: 'Seleção necessária', adb_unavailable: 'Indisponível', error: 'Erro' })}</strong></div>
      <div><span>Sistema operacional</span><strong>{appInfo.operatingSystem?.label || 'Windows'}</strong></div>
      <div><span>Aplicativo</span><strong>{appInfo.packaged ? 'Instalado · Beta' : 'Desenvolvimento · Beta'}</strong></div>
      <div><span>Último scan</span><strong>{label(context.scan.status, { idle: 'Não realizado', completed: 'Concluído', partial: 'Parcial', failed: 'Falhou', canceled: 'Cancelado', device_disconnected: 'Interrompido' })}</strong></div>
      {adbCheck.status === 'ready' && <div><span>Versão ADB</span><strong>{adbCheck.data?.adb?.version || 'Não informada'}</strong></div>}
    </div>
    <div className="support-diagnostic-actions">
      <button type="button" onClick={checkAdb} disabled={adbCheck.status === 'checking'}>{adbCheck.status === 'checking' ? <Loader2 className="spin" size={15} /> : <RefreshCw size={15} />}Testar ADB</button>
      <button type="button" onClick={startupStatus?.checkApi} disabled={api === 'checking'}>{api === 'checking' ? <Loader2 className="spin" size={15} /> : <Activity size={15} />}Verificar API</button>
      <button className="primary" type="button" onClick={exportDiagnostic} disabled={exportState.status === 'saving'}>{exportState.status === 'saving' ? <Loader2 className="spin" size={15} /> : <Download size={15} />}Exportar diagnóstico</button>
    </div>
    {adbCheck.status === 'error' && <p className="support-diagnostic-feedback error"><AlertTriangle size={14} />Não foi possível consultar o ADB.</p>}
    {exportState.message && <p className={`support-diagnostic-feedback ${exportState.status === 'saved' ? 'success' : 'error'}`}>{exportState.status === 'saved' ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}{exportState.message}</p>}
    <p className="support-diagnostic-privacy">A exportação não inclui senha, tokens, chaves, URLs internas nem serial do dispositivo.</p>
  </div>
}

export default SupportDiagnostic
