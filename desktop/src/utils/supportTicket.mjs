const SECRET_KEYS = /password|senha|token|secret|authorization|cookie|database|redis|url|serial|path|content/i

function safeText(value, limit = 500) {
  return String(value || '')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/https?:\/\/\S+/gi, '[endereço removido]')
    .replace(/\bBearer\s+\S+/gi, 'Bearer [removido]')
    .replace(/\b(password|senha|token|secret|authorization)\s*[:=]\s*\S+/gi, '$1=[removido]')
    .trim().slice(0, limit)
}

function sanitize(value, depth = 0) {
  if (depth > 4 || value === null || value === undefined) return value ?? null
  if (Array.isArray(value)) return value.slice(0, 20).map((item) => sanitize(item, depth + 1))
  if (typeof value !== 'object') return typeof value === 'string' ? safeText(value) : value
  return Object.fromEntries(Object.entries(value).filter(([key]) => !SECRET_KEYS.test(key)).map(([key, item]) => [key, sanitize(item, depth + 1)]))
}

export function buildSupportTicket({ question, answer, version, profile, apiStatus, context, logs = [], now = new Date() } = {}) {
  return sanitize({
    schemaVersion: 1,
    status: 'support_human_coming_soon',
    createdAt: now.toISOString(),
    question: safeText(question),
    assistantAnswer: safeText(answer, 1200),
    application: { name: 'DiagPro', version: safeText(version, 40) || 'Não informada' },
    profile: safeText(profile, 80) || 'Conta autenticada',
    api: { status: safeText(apiStatus, 30) || 'Não informado' },
    device: context?.device || {},
    scan: context?.scan || {},
    recentLogs: logs,
    privacy: 'Resumo sanitizado: não inclui senha, token, segredo, serial completo ou conteúdo privado do aparelho.',
  })
}

export function ticketSummary(ticket) {
  return ['Chamado DiagPro', `Data: ${ticket.createdAt}`, `Pergunta: ${ticket.question || 'Não informada'}`, `Orientação: ${ticket.assistantAnswer || 'Não disponível'}`, `API: ${ticket.api?.status || 'Não informada'}`, `ADB: ${ticket.device?.status || 'Não informado'}`, `Aparelho: ${ticket.device?.manufacturer || ''} ${ticket.device?.model || 'Não informado'}`.trim(), `Android: ${ticket.device?.android || 'Não informado'}`, `Scan: ${ticket.scan?.status || 'Não realizado'} · ${ticket.scan?.mode || 'modo não informado'}`, `Findings: ${ticket.scan?.findings ?? 0}`, `Módulos limitados: ${ticket.scan?.unavailableModules?.join(', ') || 'Nenhum informado'}`].join('\n')
}
