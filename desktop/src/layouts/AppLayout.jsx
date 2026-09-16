import {
  LayoutDashboard, ScanLine, Smartphone, ShieldAlert, Users, FileText,
  BarChart3, Settings, CreditCard, Search, Bell, ChevronDown, HelpCircle, LifeBuoy
} from 'lucide-react'
import DiagIaAssistant from '../components/DiagIaAssistant.jsx'
import './AppLayout.css'

const menuGroups = [
  {
    title: 'PRINCIPAL',
    items: [
      { icon: LayoutDashboard, label: 'Dashboard' },
      { icon: ScanLine, label: 'Scanner' },
      { icon: Smartphone, label: 'Dispositivos' },
      { icon: ShieldAlert, label: 'Ameaças' },
    ],
  },
  {
    title: 'GESTÃO',
    items: [
      { icon: Users, label: 'Clientes' },
      { icon: FileText, label: 'Relatórios' },
      { icon: BarChart3, label: 'Visão Gerencial' },
    ],
  },
  {
    title: 'SISTEMA',
    items: [
      { icon: Settings, label: 'Configurações' },
      { icon: CreditCard, label: 'Plano e assinatura' },
      { icon: LifeBuoy, label: 'Suporte' },
    ],
  },
]

function AppLayout({ username, onLogout, activePage, onNavigate, startupStatus, device, scanSession, diagIaOpen, onDiagIaOpenChange, children }) {
  const apiOnline = startupStatus?.api?.status === 'online'
  return (
    <div className="dp-layout">
      <aside className="dp-sidebar">
        <div className="dp-logo">
          <img src="./logo.png" alt="DiagPro" className="dp-logo-icon" />
          <div>
            <div className="dp-logo-title">Diag<span>Pro</span></div>
            <div className="dp-logo-sub">Diagnóstico profissional de dispositivos</div>
          </div>
        </div>

        <nav className="dp-nav">
          {menuGroups.map((group) => (
            <div className="dp-nav-group" key={group.title}>
              <div className="dp-nav-group-title">{group.title}</div>
              {group.items.map((item) => (
                <div
                  key={item.label}
                  className={`dp-nav-item ${activePage === item.label ? 'active' : ''}`}
                  onClick={() => onNavigate(item.label)}
                >
                  <item.icon size={18} />
                  <span>{item.label}</span>
                </div>
              ))}
            </div>
          ))}
        </nav>

        <div className="dp-sidebar-bottom">
          <button className="dp-help-link" onClick={onLogout}>
            <HelpCircle size={16} /> Sair
          </button>
        </div>
      </aside>

      <div className="dp-main">
        <header className="dp-topbar">
          <div className="dp-search">
            <Search size={16} />
            <input placeholder="Buscar dispositivo, cliente, relatório..." />
            <kbd>Ctrl + K</kbd>
          </div>
          <div className="dp-topbar-right">
            <button className="dp-icon-btn dp-notif">
              <Bell size={18} />
              <span className="dp-notif-badge">3</span>
            </button>
            <div className="dp-user">
              <div className="dp-avatar" />
              <div>
                <div className="dp-user-name">{username || 'Assistência Tech'}</div>
                <div className="dp-user-role">Conta autenticada</div>
              </div>
              <ChevronDown size={16} />
            </div>
          </div>
        </header>

        <div className="dp-content">
          {children}
        </div>

        <footer className="dp-footer">
          <span>{apiOnline ? '🟢' : '🟡'} API: {apiOnline ? 'Conectada' : startupStatus?.api?.status === 'checking' ? 'Conectando…' : 'Indisponível'}</span>
          <span>Versão: {startupStatus?.appInfo?.version || '--'}</span>
          <span>© 2026 DiagPro. Todos os direitos reservados.</span>
        </footer>
      </div>
      <DiagIaAssistant device={device} scanSession={scanSession} startupStatus={startupStatus} profile="Conta autenticada" open={diagIaOpen} onOpenChange={onDiagIaOpenChange} />
    </div>
  )
}

export default AppLayout
