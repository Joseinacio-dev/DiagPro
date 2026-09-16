import { useState } from 'react'
import { BotMessageSquare, ChevronDown, Headphones, LifeBuoy, MessageCircle, ShieldCheck, Sparkles, Wrench } from 'lucide-react'
import SupportDiagnostic from '../components/SupportDiagnostic.jsx'
import './SupportPage.css'

const HELP_ITEMS = [
  ['Como conectar um Android', 'Use um cabo USB de dados, desbloqueie o celular e selecione transferência de dados quando o Android solicitar.'],
  ['Como autorizar ADB', 'Ative a Depuração USB nas opções do desenvolvedor e aceite a impressão digital deste computador no aviso exibido pelo celular.'],
  ['Problemas com Scanner', 'Confirme que o aparelho permanece conectado, desbloqueado e autorizado durante toda a análise.'],
  ['Problemas com login', 'Verifique a internet e o estado da API. Em cold start, aguarde a conexão terminar antes de tentar novamente.'],
  ['Problemas com licença', 'Atualize Plano e assinatura e confirme se o login foi feito na conta associada ao plano.'],
  ['Scanner parcial', 'Significa que um ou mais módulos não puderam coletar todos os sinais. Consulte a cobertura e os módulos indisponíveis.'],
  ['Dispositivo offline', 'Reconecte o cabo, mantenha a tela desbloqueada e confirme novamente a autorização de depuração USB.'],
]

function SupportPage({ startupStatus, device, scanSession, onOpenDiagIa }) {
  const [openHelp, setOpenHelp] = useState(null)
  return <section className="support-page" aria-labelledby="support-title">
    <header className="support-heading"><div><h1 id="support-title">Suporte</h1><p>Central de ajuda e diagnóstico do DiagPro</p></div><span><LifeBuoy size={19} /> Beta assistido</span></header>

    <div className="support-grid">
      <article className="support-card support-ai-card"><div className="support-card-icon cyan"><Sparkles size={21} /></div><div className="support-card-copy"><h2>Diag IA</h2><p>O suporte inteligente do DiagPro explica conexões, estados do Scanner, cobertura e findings sem executar ações no aparelho.</p></div><button type="button" onClick={onOpenDiagIa}><BotMessageSquare size={16} />Abrir assistente</button></article>

      <article className="support-card support-human-card"><div className="support-card-icon"><Headphones size={21} /></div><div className="support-card-copy"><h2>Suporte humano</h2><p>Os canais de atendimento ainda não foram configurados para esta versão beta.</p></div><div className="support-human-actions"><button type="button" disabled><Wrench size={15} />Abrir chamado <small>Em breve</small></button><button type="button" disabled><MessageCircle size={15} />Falar com suporte <small>Em breve</small></button></div></article>
    </div>

    <article className="support-section"><header><div className="support-card-icon"><ShieldCheck size={20} /></div><div><h2>Diagnóstico técnico</h2><p>Informações seguras desta instalação para identificar problemas de funcionamento.</p></div></header><SupportDiagnostic startupStatus={startupStatus} device={device} scanSession={scanSession} /></article>

    <article className="support-section"><header><div className="support-card-icon"><LifeBuoy size={20} /></div><div><h2>Ajuda rápida</h2><p>Orientações locais para as situações mais comuns.</p></div></header><div className="support-help-list">{HELP_ITEMS.map(([title, answer]) => <div className={openHelp === title ? 'open' : ''} key={title}><button type="button" aria-expanded={openHelp === title} onClick={() => setOpenHelp((current) => current === title ? null : title)}><span>{title}</span><ChevronDown size={16} /></button>{openHelp === title && <p>{answer}</p>}</div>)}</div></article>
  </section>
}

export default SupportPage
