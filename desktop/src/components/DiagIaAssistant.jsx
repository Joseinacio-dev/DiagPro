import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ChevronRight, Clipboard, Download, LifeBuoy, Maximize2, Minimize2, Send, X } from 'lucide-react'
import { DIAG_IA_ICON_SIZE, clamp, loadDiagIaPosition, panelPosition, positionBounds, saveDiagIaPosition, snapPosition } from '../utils/diagIaPosition.mjs'
import { buildSupportContext, DIAG_IA_ACTIONS } from '../utils/supportContext.mjs'
import { buildSupportTicket, ticketSummary } from '../utils/supportTicket.mjs'
import { requestDiagIaGuidance } from '../services/diagIa.mjs'
import { buildOnlineDiagIaContext, requestOnlineDiagIa } from '../services/diagIaApi.js'
import './DiagIaAssistant.css'

const WELCOME = 'Olá! Posso ajudar com conexão Android, Scanner, resultados, licença e uso do DiagPro.'
const ONLINE_CONSENT_KEY = 'diagpro_diag_ia_online_consent_v1'

export function DiagIaGlyph({ size = DIAG_IA_ICON_SIZE }) {
  return <svg aria-hidden="true" className="diag-ia-glyph" width={size} height={size} viewBox="0 0 32 32" fill="none"><path d="M16 3 27 9.5v13L16 29 5 22.5v-13L16 3Z" /><path d="M11 11.5h5a5 5 0 1 1 0 10h-5v-10Z" /><circle cx="11" cy="8" r="1.5" /><circle cx="24" cy="16" r="1.5" /><circle cx="11" cy="24" r="1.5" /><path d="M11 9.5v2M22.5 16H21M11 22v2" /></svg>
}

function currentBounds() {
  const main = document.querySelector('.dp-main')?.getBoundingClientRect()
  const footer = document.querySelector('.dp-footer')?.getBoundingClientRect()
  return positionBounds({ viewportWidth: window.innerWidth, viewportHeight: window.innerHeight, contentLeft: main?.left || 200, footerHeight: footer?.height || 36 })
}

function statusLabel(status) {
  return { connected: 'Conectado', authorized: 'Autorizado', waiting: 'Aguardando dispositivo', disconnected: 'Desconectado', unauthorized: 'Autorização necessária', offline: 'Offline', multiple: 'Seleção necessária', adb_unavailable: 'ADB indisponível', error: 'Erro', completed: 'Concluído', partial: 'Parcial', idle: 'Ainda não realizado', failed: 'Falhou', canceled: 'Cancelado', device_disconnected: 'Interrompido por desconexão' }[status] || 'Não disponível'
}

function downloadTicket(ticket) {
  const blob = new Blob([JSON.stringify(ticket, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `diagpro-chamado-${Date.now()}.json`
  link.click()
  URL.revokeObjectURL(url)
}

function DiagIaAssistant({ device, scanSession, startupStatus, profile, open, onOpenChange }) {
  const [bounds, setBounds] = useState(() => currentBounds())
  const [position, setPosition] = useState(() => loadDiagIaPosition(localStorage, currentBounds()))
  const [question, setQuestion] = useState('')
  const [messages, setMessages] = useState([{ role: 'assistant', text: WELCOME }])
  const [offerSupport, setOfferSupport] = useState(false)
  const [ticketPreview, setTicketPreview] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [lastDomain, setLastDomain] = useState(null)
  const [feedback, setFeedback] = useState('')
  const [loading, setLoading] = useState(false)
  const [onlineConsent, setOnlineConsent] = useState(() => localStorage.getItem(ONLINE_CONSENT_KEY) === 'accepted')
  const [privacyDismissed, setPrivacyDismissed] = useState(() => localStorage.getItem(ONLINE_CONSENT_KEY) === 'accepted')
  const drag = useRef(null)
  const suppressClick = useRef(false)
  const conversation = useRef(null)
  const context = useMemo(() => buildSupportContext({ device, scanSession }), [device, scanSession])
  const onlineContext = useMemo(() => buildOnlineDiagIaContext(context, startupStatus), [context, startupStatus])
  const lastAnswer = [...messages].reverse().find((item) => item.role === 'assistant')?.text || WELCOME
  const lastQuestion = [...messages].reverse().find((item) => item.role === 'user')?.text || question
  const ticket = useMemo(() => buildSupportTicket({ question: lastQuestion, answer: lastAnswer, version: startupStatus?.appInfo?.version, profile, apiStatus: startupStatus?.api?.status, context }), [lastQuestion, lastAnswer, startupStatus, profile, context])

  useEffect(() => { conversation.current?.scrollTo({ top: conversation.current.scrollHeight, behavior: 'smooth' }) }, [messages])

  async function ask(payload, visibleQuestion) {
    if (loading) return
    if (visibleQuestion) setMessages((current) => [...current, { role: 'user', text: visibleQuestion }])
    setLoading(true)
    try {
      const history = messages.slice(-8).map((item) => ({ role: item.role, content: item.text }))
      const useOnline = onlineConsent && payload.actionId !== 'support' && visibleQuestion
      const response = await requestDiagIaGuidance({
        ...payload,
        question: useOnline ? visibleQuestion : payload.question,
        history,
        context: useOnline ? onlineContext : context,
        previousDomain: lastDomain,
        backendProvider: useOnline ? requestOnlineDiagIa : null,
      })
      setMessages((current) => [...current, { role: 'assistant', text: response.message }])
      if (response.domain) setLastDomain(response.domain)
      setOfferSupport(response.escalate === true)
      if (payload.actionId === 'support') setTicketPreview(true)
    } finally {
      setLoading(false)
    }
  }
  function submitQuestion(event) {
    event.preventDefault()
    const text = question.trim()
    if (!text) return
    setQuestion('')
    ask({ question: text }, text)
  }
  async function copyTicket() {
    try { await navigator.clipboard.writeText(ticketSummary(ticket)); setFeedback('Resumo copiado com segurança.') }
    catch { setFeedback('Não foi possível copiar. Use a exportação JSON.') }
  }
  function enableOnlineIa() {
    localStorage.setItem(ONLINE_CONSENT_KEY, 'accepted')
    setOnlineConsent(true)
    setPrivacyDismissed(true)
  }

  const recalculate = useCallback(() => {
    const nextBounds = currentBounds()
    setBounds(nextBounds)
    setPosition((current) => { const next = snapPosition(current, nextBounds); saveDiagIaPosition(localStorage, next, nextBounds); return next })
  }, [])
  useEffect(() => { window.addEventListener('resize', recalculate); return () => window.removeEventListener('resize', recalculate) }, [recalculate])

  function handlePointerDown(event) {
    if (event.button !== 0) return
    event.currentTarget.setPointerCapture(event.pointerId)
    drag.current = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, offsetX: event.clientX - position.x, offsetY: event.clientY - position.y, moved: false }
  }
  function handlePointerMove(event) {
    if (!drag.current || drag.current.pointerId !== event.pointerId) return
    if (Math.hypot(event.clientX - drag.current.startX, event.clientY - drag.current.startY) > 5) drag.current.moved = true
    if (!drag.current.moved) return
    setPosition({ x: clamp(event.clientX - drag.current.offsetX, bounds.left, bounds.right), y: clamp(event.clientY - drag.current.offsetY, bounds.top, bounds.bottom), edge: position.edge })
  }
  function handlePointerUp(event) {
    if (!drag.current || drag.current.pointerId !== event.pointerId) return
    const moved = drag.current.moved
    drag.current = null
    if (!moved) return
    suppressClick.current = true
    setPosition((current) => { const next = snapPosition(current, bounds); saveDiagIaPosition(localStorage, next, bounds); return next })
  }
  function handleClick() { if (suppressClick.current) { suppressClick.current = false; return }; onOpenChange?.(!open) }

  const panel = panelPosition(position, bounds)
  const panelStyle = expanded ? undefined : { left: panel.left, top: panel.top }
  return <div className={`diag-ia-layer ${expanded ? 'is-expanded' : ''}`}>
    {open && <aside className={`diag-ia-panel opens-${panel.side} ${expanded ? 'expanded' : ''}`} style={panelStyle} aria-label="Painel da Diag IA">
      <header><span className="diag-ia-panel-mark"><DiagIaGlyph size={22} /></span><div><strong>Diag IA</strong><small>Assistente inteligente do DiagPro</small></div><button type="button" onClick={() => setExpanded((value) => !value)} aria-label={expanded ? 'Recolher Diag IA' : 'Expandir Diag IA'} title={expanded ? 'Recolher' : 'Expandir'}>{expanded ? <Minimize2 size={17} /> : <Maximize2 size={17} />}</button><button type="button" onClick={() => { setExpanded(false); onOpenChange?.(false) }} aria-label="Fechar Diag IA"><X size={18} /></button></header>
      <div className="diag-ia-panel-body">
        <section className="diag-ia-conversation" ref={conversation} aria-live="polite" aria-label="Conversa com a Diag IA">{messages.map((message, index) => <div className={`diag-ia-message ${message.role}`} key={`${message.role}-${index}`}><span>{message.role === 'assistant' ? 'Diag IA' : 'Você'}</span><p>{message.text}</p></div>)}{loading && <div className="diag-ia-message assistant thinking"><span>Diag IA</span><p>Diag IA está analisando…</p></div>}</section>
        {!privacyDismissed && <section className="diag-ia-privacy"><p>Para responder, a Diag IA pode enviar sua pergunta e informações técnicas necessárias ao serviço de IA. Senhas, tokens e arquivos pessoais não são enviados.</p><div><button type="button" onClick={() => setPrivacyDismissed(true)}>Continuar localmente</button><button type="button" onClick={enableOnlineIa}>Ativar IA online</button></div></section>}
        {offerSupport && <button className="diag-ia-escalate" type="button" onClick={() => setTicketPreview(true)}><LifeBuoy size={14} />Abrir chamado com este contexto</button>}
        <form className="diag-ia-question" onSubmit={submitQuestion}><label htmlFor="diag-ia-question">Pergunte sobre o DiagPro</label><div><textarea id="diag-ia-question" rows="2" maxLength="500" value={question} disabled={loading} onChange={(event) => setQuestion(event.target.value)} placeholder="Ex.: meu ADB não reconhece o aparelho" /><button type="submit" disabled={loading || !question.trim()} aria-label="Enviar pergunta"><Send size={17} /></button></div></form>
        <section className="diag-ia-suggestions" aria-label="Perguntas rápidas">{DIAG_IA_ACTIONS.map(([id, label]) => <button type="button" disabled={loading} key={id} onClick={() => ask({ actionId: id }, label)}><span>{label}</span><ChevronRight size={15} /></button>)}</section>
        <details className="diag-ia-context"><summary>Ver contexto técnico</summary><div className="diag-ia-context-grid"><div><span>Dispositivo</span><strong>{context.device.model || 'Não conectado'}</strong></div><div><span>Android</span><strong>{context.device.android ? `Android ${context.device.android}` : 'Não informado'}</strong></div><div><span>Estado ADB</span><strong>{statusLabel(context.device.status)}</strong></div><div><span>Último scan</span><strong>{statusLabel(context.scan.status)}</strong></div><div><span>Modo</span><strong>{context.scan.mode || 'Não informado'}</strong></div><div><span>Findings</span><strong>{context.scan.findings}</strong></div><div><span>Cobertura</span><strong>{context.scan.coveragePercent === null ? 'Não calculada' : `${context.scan.coveragePercent}%`}</strong></div><div><span>Módulos limitados</span><strong>{context.scan.unavailableModules.length}</strong></div></div></details>
        <button className="diag-ia-human" type="button" onClick={() => { setFeedback(''); setTicketPreview(true) }}><LifeBuoy size={16} /><span><strong>Abrir chamado</strong><small>Prévia segura · suporte humano em breve</small></span></button>
        {ticketPreview && <section className="diag-ia-ticket" aria-label="Prévia do chamado"><header><strong>Prévia do chamado</strong><button type="button" onClick={() => setTicketPreview(false)} aria-label="Fechar prévia"><X size={15} /></button></header><p>Revise e exporte o contexto técnico sanitizado. O envio automático ainda não está disponível.</p><dl><div><dt>Pergunta</dt><dd>{ticket.question || 'Não informada'}</dd></div><div><dt>API / ADB</dt><dd>{ticket.api.status} / {statusLabel(ticket.device.status)}</dd></div><div><dt>Último scan</dt><dd>{statusLabel(ticket.scan.status)} · {ticket.scan.mode || 'modo não informado'}</dd></div></dl><div className="diag-ia-ticket-actions"><button type="button" onClick={copyTicket}><Clipboard size={14} />Copiar resumo</button><button type="button" onClick={() => downloadTicket(ticket)}><Download size={14} />Exportar JSON</button></div>{feedback && <small className="diag-ia-feedback">{feedback}</small>}</section>}
        <p className="diag-ia-limit">A Diag IA orienta dentro do DiagPro. Ela não executa limpeza, remoção, alteração no aparelho ou envio externo de dados.</p>
      </div>
    </aside>}
    <button type="button" className="diag-ia-bubble" style={{ left: position.x, top: position.y }} aria-label="Diag IA — Suporte inteligente" title="Diag IA — arraste para reposicionar" onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={handlePointerUp} onPointerCancel={() => { drag.current = null }} onClick={handleClick}><span className="diag-ia-pulse" /><DiagIaGlyph /></button>
  </div>
}

export default DiagIaAssistant
