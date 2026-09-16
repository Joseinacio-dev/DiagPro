import { useEffect, useRef, useState } from 'react'
import './QuickActionPanel.css'

const titles = { cleanup: 'Limpeza Profunda — preview', optimization: 'Otimização — diagnóstico', battery: 'Verificação de Bateria', backup: 'Backup — criação indisponível' }
const actionStates = {
  cleanup: 'DIAGNÓSTICO APENAS',
  optimization: 'DIAGNÓSTICO APENAS',
  battery: 'FUNCIONAL',
  backup: 'INDISPONÍVEL',
}

export default function QuickActionPanel({ action, device, onClose, onManageApps }) {
  const [state, setState] = useState({ status: 'loading' })
  const [revision, setRevision] = useState(0)
  const closeButton = useRef(null)
  const currentOperation = useRef(null)
  useEffect(() => {
    const previous = document.activeElement
    closeButton.current?.focus()
    return () => previous?.focus?.()
  }, [])
  useEffect(() => {
    let active = true
    const operationId = window.crypto?.randomUUID?.() || `quick-${Date.now()}-${Math.random().toString(16).slice(2)}`
    currentOperation.current = { serial: device.serial, operationId }
    setState({ status: 'loading' })
    async function load() {
      if (device.status !== 'connected') return setState({ status: 'error', message: 'Conecte e autorize um dispositivo Android.' })
      if (!window.diagpro?.inspectQuickAction) return setState({ status: 'error', message: 'Consulta ADB não disponível nesta interface. Abra a versão desktop atualizada.' })
      try {
        const result = await window.diagpro.inspectQuickAction({ serial: device.serial, action, operationId })
        if (!active) return
        if (!result?.ok) setState({ status: 'error', message: result?.message || 'Não foi possível consultar o dispositivo.' })
        else if (result.data?.serial !== device.serial || result.data?.action !== action) setState({ status: 'error', message: 'Resposta incompatível com o dispositivo selecionado.' })
        else setState({ status: 'ready', data: result.data })
      } catch {
        if (active) setState({ status: 'error', message: 'Consulta indisponível. Verifique o ADB e a conexão do dispositivo.' })
      } finally {
        if (currentOperation.current?.operationId === operationId) currentOperation.current = null
      }
    }
    void load()
    return () => {
      active = false
      if (currentOperation.current?.operationId === operationId && window.diagpro?.cancelQuickAction) {
        void window.diagpro.cancelQuickAction({ serial: device.serial, operationId })
      }
    }
  }, [action, device.serial, device.status, revision])

  function closePanel() {
    const operation = currentOperation.current
    if (operation && window.diagpro?.cancelQuickAction) void window.diagpro.cancelQuickAction(operation)
    onClose()
  }

  function onKeyDown(event) {
    if (event.key === 'Escape') closePanel()
    if (event.key !== 'Tab') return
    const buttons = [...event.currentTarget.querySelectorAll('button:not(:disabled)')]
    const first = buttons[0]
    const last = buttons.at(-1)
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
  }
  return <div className="dp-quick-overlay">
    <section className="dp-quick-dialog" role="dialog" aria-modal="true" aria-labelledby="quick-action-title" onKeyDown={onKeyDown}>
      <header><div><h2 id="quick-action-title">{titles[action]}</h2><span className={`dp-quick-state state-${action}`}>{actionStates[action]}</span></div><button ref={closeButton} onClick={closePanel} aria-label="Fechar">Fechar</button></header>
      <p>Esta consulta não executa limpeza, otimização nem backup.</p>
      <p>Dispositivo: {device.serial || 'Não conectado'}</p>
      <div aria-live="polite" aria-busy={state.status === 'loading'}>
        {state.status === 'loading' && <p>Consultando dados reais do Android… Você pode cancelar fechando esta janela.</p>}
        {state.status === 'error' && <p role="alert">{state.message}</p>}
        {state.status === 'ready' && <>
          <p>{state.data.coverage === 'unavailable' ? 'Não disponível neste dispositivo' : 'Cobertura parcial'} · Consulta: {new Date(state.data.collectedAt).toLocaleString('pt-BR')}</p>
          {state.data.sections.map(section => <section className="dp-quick-reading" key={section.label}>
            <h3>{section.label}</h3>
            {section.status !== 'available' && <p>{section.status === 'partial' ? 'Cobertura parcial' : 'Não disponível neste dispositivo'}{section.reason ? ` — ${section.reason}` : ''}</p>}
            <dl>{section.fields.map(field => <div key={field.name}><dt>{field.name}</dt><dd>{field.value ?? 'Não disponível neste dispositivo'}</dd></div>)}</dl>
          </section>)}
          <ul>{state.data.notes.map(note => <li key={note}>{note}</li>)}</ul>
        </>}
      </div>
      <footer>
        <button onClick={() => setRevision(value => value + 1)} disabled={state.status === 'loading' || device.status !== 'connected'}>Atualizar consulta</button>
        {action === 'optimization' && <button onClick={onManageApps}>Gerenciar Apps</button>}
        {action === 'cleanup' && <button disabled title="Não há candidatos de exclusão validados neste fluxo.">Executar limpeza — indisponível</button>}
        {action === 'backup' && <button disabled title="Cópia e restauração confiáveis ainda não validadas.">Criar backup — indisponível</button>}
      </footer>
    </section>
  </div>
}
