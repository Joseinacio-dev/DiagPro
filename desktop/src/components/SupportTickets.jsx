import { useState } from 'react'
import { supportTickets } from '../services/supportTickets.js'
const STATUS = { OPEN: 'Aberto', IN_PROGRESS: 'Em atendimento', WAITING_CUSTOMER: 'Aguardando cliente', RESOLVED: 'Resolvido', CLOSED: 'Fechado' }
export default function SupportTickets() {
  const [subject, setSubject] = useState(''), [description, setDescription] = useState('')
  const [tickets, setTickets] = useState([]), [message, setMessage] = useState(''), [busy, setBusy] = useState(false)
  async function load() {
    setBusy(true)
    try { const data = await supportTickets(); setTickets(data.results || []); setMessage('Últimos 20 chamados. Não há atendimento em tempo real nesta tela.') }
    catch (error) { setMessage(error.message) }
    finally { setBusy(false) }
  }
  async function create(event) {
    event.preventDefault(); setBusy(true)
    try {
      const ticket = await supportTickets({ subject, description })
      setTickets(current => [ticket, ...current].slice(0, 20)); setSubject(''); setDescription('')
      setMessage(`Chamado #${ticket.id} enviado. Consulte a resposta em Meus chamados.`)
    } catch (error) { setMessage(error.message) }
    finally { setBusy(false) }
  }
  return <article className="support-section" id="support-tickets"><h2>Chamados</h2>
    <p>Envie somente uma descrição do problema. Não inclua senhas, tokens, dados pessoais ou arquivos do celular. O texto será armazenado no servidor para atendimento.</p>
    <form onSubmit={create}>
      <label htmlFor="ticket-subject">Assunto</label><input id="ticket-subject" required maxLength={160} value={subject} onChange={e => setSubject(e.target.value)} />
      <label htmlFor="ticket-description">Descrição</label><textarea id="ticket-description" required maxLength={5000} rows={4} value={description} onChange={e => setDescription(e.target.value)} />
      <button disabled={busy} type="submit">{busy ? 'Aguarde…' : 'Enviar chamado'}</button>
      <button disabled={busy} type="button" onClick={load}>Meus chamados / Atualizar</button>
    </form><p role="status">{message}</p>
    {tickets.map(ticket => <article key={ticket.id}><h3>#{ticket.id} — {ticket.subject}</h3><p>{STATUS[ticket.status] || 'Não disponível'}</p><p>{ticket.description}</p>{ticket.staff_response && <p>Resposta da equipe: {ticket.staff_response}</p>}</article>)}
  </article>
}
