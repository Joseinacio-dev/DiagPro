import { useEffect, useMemo, useState } from 'react'
import {
  BriefcaseBusiness, CheckCircle2, EyeOff, Info, Loader2, Monitor,
  RefreshCw, Rocket, ShieldCheck, Smartphone, Usb, Wrench,
} from 'lucide-react'
import SupportDiagnostic from '../components/SupportDiagnostic.jsx'
import { getCurrentUser } from '../services/settings.js'
import { loadUiPreferences, saveUiPreferences } from '../utils/settingsPreferences.mjs'
import { settingsTabsForProfile } from '../utils/supportContext.mjs'
import './SettingsPage.css'

const TAB_DETAILS = {
  general: { label: 'Geral', icon: Monitor },
  device: { label: 'Dispositivo', icon: Smartphone },
  support: { label: 'Suporte', icon: Wrench },
  about: { label: 'Sobre', icon: Info },
  admin: { label: 'Administração', icon: ShieldCheck },
}

function statusLabel(status) {
  return {
    connected: 'Conectado e autorizado', waiting: 'Nenhum dispositivo conectado',
    unauthorized: 'Autorização necessária no Android', offline: 'Dispositivo offline',
    multiple: 'Selecione um dispositivo', adb_unavailable: 'ADB indisponível', error: 'Erro de comunicação',
  }[status] || 'Não disponível'
}

function SettingsPage({ accessToken, startupStatus, device, scanSession, onNavigate }) {
  const [activeTab, setActiveTab] = useState('general')
  const [profile, setProfile] = useState(null)
  const [profileStatus, setProfileStatus] = useState('loading')
  const [preferences, setPreferences] = useState(() => loadUiPreferences(localStorage))
  const [startup, setStartup] = useState({ supported: false, enabled: false, loading: true })
  const [deviceCheck, setDeviceCheck] = useState({ status: 'idle', message: '' })
  const tabs = useMemo(() => settingsTabsForProfile(profile).map((id) => ({ id, ...TAB_DETAILS[id] })), [profile])
  const isAdmin = tabs.some((tab) => tab.id === 'admin')

  useEffect(() => {
    let active = true
    getCurrentUser({ accessToken }).then((user) => {
      if (active) { setProfile(user); setProfileStatus('ready') }
    }).catch(() => {
      if (active) { setProfile(null); setProfileStatus('unavailable') }
    })
    window.diagpro?.getStartupSettings?.().then((result) => {
      if (active && result) setStartup({ supported: result.supported === true, enabled: result.enabled === true, loading: false })
    }).catch(() => { if (active) setStartup((current) => ({ ...current, loading: false })) })
    return () => { active = false }
  }, [accessToken])

  function updateNotifications(enabled) {
    const next = saveUiPreferences(localStorage, { ...preferences, notifications: enabled })
    setPreferences(next)
  }

  async function updateStartup(enabled) {
    if (!startup.supported) return
    setStartup((current) => ({ ...current, loading: true }))
    try {
      const result = await window.diagpro?.setStartupSettings?.({ enabled })
      setStartup({ supported: result?.supported === true, enabled: result?.enabled === true, loading: false })
    } catch {
      setStartup((current) => ({ ...current, loading: false }))
    }
  }

  async function testDeviceConnection() {
    setDeviceCheck({ status: 'checking', message: '' })
    try {
      const result = await window.diagpro?.checkAdb?.()
      setDeviceCheck(result?.ok
        ? { status: 'ready', message: `Conexão verificada: ${statusLabel(result.data?.device?.status)}` }
        : { status: 'error', message: 'Não foi possível verificar a conexão ADB.' })
    } catch {
      setDeviceCheck({ status: 'error', message: 'Não foi possível verificar a conexão ADB.' })
    }
  }

  async function reconnectDevice() {
    setDeviceCheck({ status: 'checking', message: '' })
    try {
      const result = await device?.reconnect?.()
      setDeviceCheck({ status: result?.status === 'connected' ? 'ready' : 'error', message: statusLabel(result?.status) })
    } catch {
      setDeviceCheck({ status: 'error', message: 'A reconexão não pôde ser concluída.' })
    }
  }

  function renderGeneral() {
    return <section className="dp-settings-panel"><header><div className="dp-settings-section-icon"><Monitor size={20} /></div><div><h2>Geral</h2><p>Preferências locais seguras para esta instalação.</p></div></header><div className="dp-settings-option-list"><label><span><strong>Aparência</strong><small>Tema visual atual do DiagPro.</small></span><select aria-label="Aparência" value="dark" disabled><option value="dark">Escuro</option></select></label><label><span><strong>Notificações</strong><small>Mostrar avisos operacionais importantes.</small></span><input type="checkbox" checked={preferences.notifications} onChange={(event) => updateNotifications(event.target.checked)} /></label><label><span><strong>Iniciar com o Windows</strong><small>{startup.supported ? 'Abrir o DiagPro após entrar no Windows.' : 'Disponível somente no aplicativo instalado.'}</small></span><input type="checkbox" checked={startup.enabled} disabled={!startup.supported || startup.loading} onChange={(event) => updateStartup(event.target.checked)} /></label></div><div className="dp-settings-info"><EyeOff size={16} /><span>Endereços internos, comandos, variáveis de ambiente e parâmetros do Scanner não são configuráveis nesta tela.</span></div></section>
  }

  function renderDevice() {
    const model = [device?.manufacturer || device?.fabricante, device?.model || device?.modelo].filter(Boolean).join(' ')
    return <section className="dp-settings-panel"><header><div className="dp-settings-section-icon"><Usb size={20} /></div><div><h2>Dispositivo</h2><p>Estado atual da conexão Android sem alterar configurações internas do ADB.</p></div></header><div className="dp-settings-adb-result"><div className="dp-settings-status-grid"><div><span>Estado do ADB</span><strong>{statusLabel(device?.status)}</strong></div><div><span>Dispositivo selecionado</span><strong>{model || 'Nenhum'}</strong></div><div><span>Android</span><strong>{device?.versaoAndroid || device?.androidVersion || 'Não informado'}</strong></div><div><span>Origem</span><strong>ADB gerenciado pelo DiagPro</strong></div></div></div>{deviceCheck.message && <div className={`dp-settings-feedback ${deviceCheck.status === 'ready' ? 'success' : 'error'}`}>{deviceCheck.status === 'ready' ? <CheckCircle2 size={15} /> : <Wrench size={15} />}{deviceCheck.message}</div>}<div className="dp-settings-actions"><button type="button" onClick={reconnectDevice} disabled={deviceCheck.status === 'checking'}><RefreshCw size={15} />Reconectar</button><button className="primary" type="button" onClick={testDeviceConnection} disabled={deviceCheck.status === 'checking'}>{deviceCheck.status === 'checking' ? <Loader2 className="spin" size={15} /> : <Usb size={15} />}Testar conexão</button></div></section>
  }

  function renderSupport() {
    return <section className="dp-settings-panel"><header><div className="dp-settings-section-icon"><Wrench size={20} /></div><div><h2>Suporte</h2><p>API, diagnóstico técnico e logs sanitizados.</p></div></header><div className="dp-settings-embedded"><SupportDiagnostic compact startupStatus={startupStatus} device={device} scanSession={scanSession} /></div><div className="dp-settings-actions"><button className="primary" type="button" onClick={() => onNavigate?.('Suporte')}><Wrench size={15} />Abrir Central de Suporte</button></div></section>
  }

  function renderAbout() {
    return <section className="dp-settings-panel"><header><div className="dp-settings-section-icon"><Info size={20} /></div><div><h2>Sobre o DiagPro</h2><p>Identificação desta versão e informações da distribuição.</p></div></header><div className="dp-settings-adb-result"><div className="dp-settings-status-grid"><div><span>Produto</span><strong>DiagPro</strong></div><div><span>Versão</span><strong>{startupStatus?.appInfo?.version || 'Não informada'}</strong></div><div><span>Canal</span><strong>Beta</strong></div><div><span>Atualização</span><strong>Atualização manual pelo instalador</strong></div><div><span>Termos</span><strong>Consulte os documentos da distribuição</strong></div><div><span>Privacidade</span><strong>Diagnóstico técnico minimizado</strong></div></div></div><div className="dp-settings-info"><Rocket size={16} /><span>Atualizações automáticas não estão habilitadas nesta versão beta.</span></div></section>
  }

  function renderAdmin() {
    return <section className="dp-settings-panel"><header><div className="dp-settings-section-icon"><ShieldCheck size={20} /></div><div><h2>Administração</h2><p>Diagnóstico avançado visível somente para perfis administrativos informados pelo backend.</p></div></header><div className="dp-settings-adb-result"><div className="dp-settings-status-grid"><div><span>Perfil</span><strong>{profile?.is_staff ? 'Administrador' : 'Assistência'}</strong></div><div><span>Ambiente do aplicativo</span><strong>{startupStatus?.appInfo?.packaged ? 'Instalado' : 'Desenvolvimento'}</strong></div><div><span>API</span><strong>{startupStatus?.api?.status === 'online' ? 'Operacional' : 'Verificação necessária'}</strong></div><div><span>ADB</span><strong>{statusLabel(device?.status)}</strong></div></div></div><div className="dp-settings-info"><ShieldCheck size={16} /><span>Esta área não expõe credenciais, endpoints, comandos ADB, variáveis de ambiente nem parâmetros de risco. Autorizações sensíveis continuam sendo validadas no backend e IPC.</span></div></section>
  }

  const panels = { general: renderGeneral, device: renderDevice, support: renderSupport, about: renderAbout, admin: renderAdmin }
  const visiblePanel = isAdmin || activeTab !== 'admin' ? activeTab : 'general'
  return <section className="dp-settings-page" aria-labelledby="dp-settings-title"><header className="dp-settings-heading"><h1 id="dp-settings-title">Configurações</h1><p>Preferências essenciais para a operação da assistência técnica.</p></header>{profileStatus === 'unavailable' && <div className="dp-settings-profile-warning"><BriefcaseBusiness size={15} />Perfil não pôde ser confirmado; somente configurações da assistência estão disponíveis.</div>}<div className="dp-settings-layout"><nav className="dp-settings-tabs" aria-label="Seções de configurações">{tabs.map((tab) => { const Icon = tab.icon; return <button className={activeTab === tab.id ? 'active' : ''} type="button" key={tab.id} onClick={() => setActiveTab(tab.id)}><Icon size={17} /><span>{tab.label}</span>{tab.id === 'admin' && <small>ADMIN</small>}</button> })}</nav><div className="dp-settings-content">{panels[visiblePanel]()}</div></div></section>
}

export default SettingsPage
