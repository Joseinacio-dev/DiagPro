const DOMAIN = {
  PLAN: 'PLANO_LICENCA_ASSINATURA', LOGIN: 'LOGIN_CONTA', GOOGLE: 'GOOGLE_LOGIN', ADB: 'ADB_CONEXAO',
  DEVICE: 'DISPOSITIVO', QUICK: 'SCANNER_RAPIDO', COMPLETE: 'SCANNER_COMPLETO', CUSTOM: 'SCANNER_PERSONALIZADO',
  RESULT: 'RESULTADO_SCAN', PARTIAL: 'SCAN_PARCIAL', COVERAGE: 'COBERTURA', FINDING: 'FINDING',
  THREAT: 'AMEACA_SEGURANCA', BATTERY: 'BATERIA', STORAGE: 'ARMAZENAMENTO', PERFORMANCE: 'DESEMPENHO',
  APPS: 'APLICATIVOS', MANAGE_APPS: 'GERENCIAR_APPS', CLEANUP: 'LIMPEZA', OPTIMIZATION: 'OTIMIZACAO',
  BACKUP: 'BACKUP', REPORTS: 'RELATORIOS', SETTINGS: 'CONFIGURACOES', SUPPORT: 'SUPORTE', TICKET: 'CHAMADO',
  INSTALL: 'INSTALACAO', UPDATE: 'ATUALIZACAO', IA: 'DIAG_IA',
}

const DEFINITIONS = [
  { id: DOMAIN.PLAN, strong: ['plano', 'licenca', 'assinatura', 'validade', 'vence', 'vencimento'], phrases: ['qual meu plano', 'onde vejo meu plano', 'onde fica meu plano', 'ver minha assinatura', 'licenca esta ativa', 'recursos do plano'], answer: ({ context }) => {
    const plan = context?.license?.plan || context?.plan?.name
    const status = context?.license?.status || context?.plan?.status
    const expiry = context?.license?.expiresAt || context?.plan?.expiresAt
    if (plan || status || expiry) return `Seu plano${plan ? ` é ${plan}` : ''}${status ? ` e a licença está ${status}` : ''}${expiry ? ` até ${expiry}` : ''}. Esses dados vêm do estado atual da sua conta.`
    return 'Para consultar seu plano, abra Sistema > Plano e assinatura no menu lateral. Lá você pode verificar o plano atual, status da licença, validade e recursos liberados para sua conta. Como esses dados não estão disponíveis neste contexto, não consigo afirmar qual é seu plano ou quando ele vence.'
  } },
  { id: DOMAIN.LOGIN, strong: ['login', 'conta', 'senha', 'sessao', '401', '403', '500', '503'], phrases: ['nao consigo entrar', 'sessao expirou', 'lembrar me'], answer: () => 'Use seu usuário ou e-mail e senha na tela de entrada. “Lembrar-me” mantém a sessão local e Sair encerra a sessão. 401 indica credencial ou sessão inválida; 403 falta de permissão; 500 erro interno; e 503 indisponibilidade temporária. Nunca envie sua senha ao suporte.' },
  { id: DOMAIN.GOOGLE, strong: ['google'], phrases: ['entrar com google', 'login do google'], answer: () => 'Na tela de entrada, escolha Continuar com Google e conclua a autorização no navegador. O DiagPro recebe apenas a sessão emitida pelo próprio backend. Se o fluxo não concluir, tente novamente e abra um chamado caso o erro persista.' },
  { id: DOMAIN.ADB, strong: ['adb', 'offline', 'unauthorized', 'desconectado', 'conexao', 'conecta', 'reconhece', 'aparece'], phrases: ['celular nao aparece', 'adb nao reconhece', 'telefone nao conecta', 'nao acha meu celular'], answer: ({ context }) => `O estado ADB atual é ${context?.device?.status || 'não informado'}. Use um cabo USB de dados, desbloqueie o aparelho, ative a Depuração USB e aceite a autorização deste computador. Se estiver offline, reconecte o cabo; se estiver não autorizado, confirme a mensagem no Android; com múltiplos aparelhos, selecione ou mantenha apenas o correto.` },
  { id: DOMAIN.DEVICE, strong: ['dispositivo', 'aparelho', 'celular', 'telefone'], phrases: ['estado do dispositivo', 'celular funcionando'], answer: ({ context }) => `Abra Principal > Dispositivos para consultar o aparelho conectado. Estado atual: ${context?.device?.status || 'não informado'}${context?.device?.model ? `, modelo ${context.device.model}` : ''}. O histórico não representa necessariamente uma conexão atual.` },
  { id: DOMAIN.QUICK, strong: ['rapido', 'rapida'], phrases: ['scanner rapido', 'scan rapido'], answer: () => 'O Scanner Rápido executa os módulos essenciais indicados na tela para uma verificação mais curta. Ele não executa todos os módulos do modo Completo e não garante ausência de malware. Acesse Principal > Scanner.' },
  { id: DOMAIN.COMPLETE, strong: ['completo', 'completa'], phrases: ['scanner completo', 'scan completo', 'analisar tudo', 'diferenca entre rapida e completa', 'diferenca entre rapido e completo'], answer: () => 'O Scanner Rápido prioriza os módulos essenciais; o Scanner Completo solicita todos os módulos disponíveis, inclusive verificações adicionais. Ainda assim, permissões e limitações do Android podem deixar módulos parciais ou indisponíveis. “Completo” descreve o pipeline solicitado, não cobertura irrestrita do aparelho.' },
  { id: DOMAIN.CUSTOM, strong: ['personalizado', 'personalizada'], phrases: ['scanner personalizado', 'escolher modulos'], answer: () => 'No Scanner Personalizado você escolhe quais módulos executar. Apenas os módulos selecionados entram no diagnóstico, portanto a cobertura deve ser interpretada considerando essa escolha.' },
  { id: DOMAIN.RESULT, strong: ['resultado', 'score', 'saude', 'indicador', 'scanner', 'scan'], phrases: ['scan deu certo', 'interpretar resultado', 'me explica isso'], answer: ({ context }) => `O último scan está ${context?.scan?.status || 'não realizado'}, no modo ${context?.scan?.mode || 'não informado'}, com ${context?.scan?.findings ?? 0} finding(s). Saúde e risco são indicadores técnicos baseados apenas nos sinais coletados.` },
  { id: DOMAIN.PARTIAL, strong: ['parcial', 'pulou', 'terminou'], phrases: ['nao analisou tudo', 'nao conseguiu ver tudo', 'ficou limitado', 'o completo ficou limitado', 'scan nao terminou'], answer: ({ context }) => `Um scan fica parcial quando algum módulo entrega dados incompletos ou encontra uma limitação. Nesta sessão, os módulos limitados são: ${context?.scan?.unavailableModules?.join(', ') || 'não informados'}. Isso não apaga os dados válidos já coletados.` },
  { id: DOMAIN.COVERAGE, strong: ['cobertura', 'limitacao', 'limitado'], phrases: ['cobertura tecnica', 'quanto analisou'], answer: ({ context }) => `Cobertura técnica mede o alcance real dos sinais coletados, não apenas o término do pipeline. Cobertura atual: ${Number.isFinite(context?.scan?.coveragePercent) ? `${context.scan.coveragePercent}%` : 'não calculada'}. Uma cobertura limitada não deve ser interpretada como falha nem como confirmação de segurança.` },
  { id: DOMAIN.FINDING, strong: ['finding', 'achado', 'alerta'], phrases: ['achado e virus', 'alerta quer dizer'], answer: () => 'Um finding é um achado técnico que merece revisão. Ele não significa automaticamente vírus, ameaça ou malware. Consulte Principal > Ameaças para ver as evidências disponíveis e o estado da revisão.' },
  { id: DOMAIN.THREAT, strong: ['ameaca', 'virus', 'malware', 'seguranca', 'risco'], phrases: ['nenhuma ameaca', 'baixo risco'], answer: () => 'Abra Principal > Ameaças para consultar evidências e revisões. “Nenhuma ameaça confirmada” e “baixo risco observado” descrevem somente os sinais coletados e não garantem ausência de malware.' },
  { id: DOMAIN.BATTERY, strong: ['bateria', 'carga'], phrases: ['verificacao de bateria', 'saude da bateria'], answer: () => 'O módulo Bateria mostra leituras que o Android disponibiliza, como nível e estado de carregamento. A Verificação de Bateria é uma inspeção técnica; ela não altera nem recalibra fisicamente a bateria.' },
  { id: DOMAIN.STORAGE, strong: ['armazenamento', 'espaco', 'gb', 'memoria interna'], phrases: ['espaco livre', 'espaco usado'], answer: () => 'Armazenamento mostra total, usado e livre conforme as fontes acessíveis do Android. Ele é diferente da memória RAM e pode divergir da capacidade comercial por conversão de unidades e áreas reservadas do sistema.' },
  { id: DOMAIN.PERFORMANCE, strong: ['desempenho', 'ram', 'lentidao', 'lento'], phrases: ['memoria ram', 'celular lento'], answer: () => 'Desempenho reúne sinais observáveis, incluindo memória RAM disponível. Uma leitura isolada não prova defeito ou lentidão. Compare o resultado com o uso atual e as limitações registradas no diagnóstico.' },
  { id: DOMAIN.APPS, strong: ['aplicativos', 'aplicativo', 'apps', 'app'], phrases: ['apps do sistema', 'apps do usuario'], answer: () => 'A lista de aplicativos vem do aparelho conectado e separa apps do usuário e do sistema. O DiagPro mostra o packageName real e não chama um app de ameaça sem evidência.' },
  { id: DOMAIN.MANAGE_APPS, strong: ['desinstalar', 'remover'], phrases: ['gerenciar apps', 'remover aplicativo'], answer: () => 'Gerenciar Apps permite inspecionar aplicativos reais. Somente apps do usuário podem apresentar remoção, sempre com preview e confirmação explícita. Apps do sistema não podem ser removidos por essa tela.' },
  { id: DOMAIN.CLEANUP, strong: ['limpeza', 'limpar'], phrases: ['limpeza profunda', 'liberar espaco'], answer: () => 'A Limpeza Profunda deve ser interpretada conforme o estado mostrado na própria tela. Quando aparecer como diagnóstico ou preview, ela apenas identifica possibilidades e não executa exclusão automática. A Diag IA não realiza limpeza.' },
  { id: DOMAIN.OPTIMIZATION, strong: ['otimizacao', 'otimizar'], phrases: ['otimizacao do sistema', 'melhorar desempenho'], answer: () => 'A Otimização do Sistema apresenta inspeções e orientações disponíveis para o aparelho. Ela não deve prometer ganho de desempenho nem alterar configurações sem uma ação real, claramente apresentada e autorizada.' },
  { id: DOMAIN.BACKUP, strong: ['backup', 'copia'], phrases: ['backup de dados', 'salvar dados'], answer: () => 'Backup de Dados depende das permissões e recursos suportados pela versão atual. Se a tela indicar apenas orientação ou indisponibilidade, nenhum backup real foi criado. Confirme sempre o destino e o resultado exibido.' },
  { id: DOMAIN.REPORTS, strong: ['relatorio', 'relatorios', 'historico'], phrases: ['ver diagnostico antigo', 'resultado salvo'], answer: () => 'Abra Gestão > Relatórios para consultar diagnósticos salvos, histórico e detalhes técnicos. Um resultado concluído localmente pode existir mesmo quando a gravação no histórico online falha.' },
  { id: DOMAIN.SETTINGS, strong: ['configuracoes', 'preferencias', 'notificacoes'], phrases: ['iniciar com windows', 'versao do app'], answer: () => 'Abra Sistema > Configurações para preferências gerais, notificações, inicialização com o Windows e informações da versão. Opções técnicas extras aparecem somente para perfis autorizados e nunca expõem segredos.' },
  { id: DOMAIN.SUPPORT, strong: ['suporte', 'ajuda', 'pessoa', 'humano', 'atendente'], phrases: ['falar com uma pessoa', 'suporte humano'], answer: () => 'Abra Sistema > Suporte para ajuda rápida e diagnóstico técnico. Se a orientação automática não resolver, posso montar uma prévia sanitizada para suporte humano.' },
  { id: DOMAIN.TICKET, strong: ['chamado', 'ticket'], phrases: ['abre um chamado', 'abrir chamado'], answer: () => 'Posso preparar a prévia de um chamado com pergunta, resposta e contexto técnico sanitizado. O envio automático ainda não está disponível; você pode revisar, copiar o resumo ou exportar o JSON.' },
  { id: DOMAIN.INSTALL, strong: ['instalacao', 'instalar', 'installer'], phrases: ['instalar diagpro', 'assistencia tecnica'], answer: () => 'A instalação do DiagPro no Windows usa o instalador distribuído para a assistência técnica. O desktop realiza as operações locais e se comunica com o backend online para autenticação, licença e histórico.' },
  { id: DOMAIN.UPDATE, strong: ['atualizacao', 'atualizar', 'versao nova'], phrases: ['nova versao', 'atualizar diagpro'], answer: () => 'Verifique a versão atual em Sistema > Configurações ou Sistema > Suporte. Só instale atualizações distribuídas pelo canal oficial do DiagPro. Esta versão não deve afirmar que existe atualização sem consultar uma fonte real.' },
  { id: DOMAIN.IA, strong: ['diag ia', 'assistente', 'inteligencia'], phrases: ['como funciona a ia', 'o que voce faz'], answer: () => 'A Diag IA é o assistente local do DiagPro. Ela usa conhecimento estruturado e o contexto técnico disponível para orientar, mas não executa ações destrutivas, não acessa conteúdo privado e não substitui a análise humana quando há incerteza.' },
]

const TYPO_ALIASES = new Map(Object.entries({
  licenssa: 'licenca', scaner: 'scanner', escaneer: 'scanner', dispostivo: 'dispositivo',
  conecao: 'conexao', coneccao: 'conexao', relatorioo: 'relatorio', armazenameto: 'armazenamento',
}))
const WORD_ALIASES = new Map(Object.entries({ nao: 'nao', naum: 'nao', n: 'nao', pq: 'porque', pra: 'para', ta: 'esta', msm: 'mesmo', aq: 'aqui', oq: 'o que' }))
const GENERIC_WORDS = new Set(['como', 'onde', 'qual', 'quais', 'meu', 'minha', 'sobre', 'vejo', 'ver', 'fica', 'esta', 'para', 'porque', 'tenho', 'quero', 'isso', 'aqui'])

export function normalizeDiagIaText(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9_ ]+/g, ' ').split(/\s+/).filter(Boolean)
    .flatMap((word) => String(WORD_ALIASES.get(word) || TYPO_ALIASES.get(word) || word).split(' '))
    .join(' ').replace(/\s+/g, ' ').trim()
}

function editDistance(a, b) {
  const row = Array.from({ length: b.length + 1 }, (_, index) => index)
  for (let i = 1; i <= a.length; i += 1) {
    let previous = row[0]; row[0] = i
    for (let j = 1; j <= b.length; j += 1) {
      const current = row[j]
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, previous + (a[i - 1] === b[j - 1] ? 0 : 1))
      previous = current
    }
  }
  return row[b.length]
}

function tokenMatches(actual, expected) {
  if (actual === expected) return true
  if (actual.length < 5 || expected.length < 5 || GENERIC_WORDS.has(expected)) return false
  return Math.abs(actual.length - expected.length) <= 1 && editDistance(actual, expected) <= 1
}

function scoreDefinition(text, definition) {
  const tokens = text.split(' ')
  let score = 0
  for (const phrase of definition.phrases || []) if (text.includes(normalizeDiagIaText(phrase))) score += 9
  for (const term of definition.strong || []) {
    const expected = normalizeDiagIaText(term)
    if (expected.includes(' ')) { if (text.includes(expected)) score += 6; continue }
    if (tokens.includes(expected)) score += 6
    else if (tokens.some((actual) => tokenMatches(actual, expected))) score += 3
  }
  return score
}

function confidenceFor(best, second) {
  if (!best || best.score < 3 || best.score === second?.score) return 'low'
  if (best.score >= 9 || best.score - (second?.score || 0) >= 5) return 'high'
  return 'medium'
}

export function interpretDiagIaQuestion(question, { previousDomain = null } = {}) {
  const text = normalizeDiagIaText(question)
  if (!text) return { domain: null, confidence: 'low', score: 0, normalized: text }
  const ranked = DEFINITIONS.map((definition) => ({ definition, score: scoreDefinition(text, definition) }))
    .sort((a, b) => b.score - a.score || a.definition.id.localeCompare(b.definition.id))
  let [best, second] = ranked
  if (previousDomain && best.score < 6) {
    const previous = ranked.find((entry) => entry.definition.id === previousDomain)
    if (previous && /\b(vence|validade|ele|ela|isso|tambem|e)\b/.test(text)) previous.score += 5
    ranked.sort((a, b) => b.score - a.score || a.definition.id.localeCompare(b.definition.id)); [best, second] = ranked
  }
  const confidence = confidenceFor(best, second)
  return { domain: confidence === 'low' ? null : best.definition.id, confidence, score: best.score, normalized: text }
}

export function answerDiagIaQuestion(question, context = {}, { previousDomain = null } = {}) {
  const interpretation = interpretDiagIaQuestion(question, { previousDomain })
  if (!interpretation.domain) return { ...interpretation, topic: null, escalate: false, message: 'Não entendi exatamente qual parte do DiagPro você quer consultar. Pode me dizer se é sobre plano, scanner, dispositivo, ADB ou outra função?' }
  const definition = DEFINITIONS.find((entry) => entry.id === interpretation.domain)
  const prefix = interpretation.confidence === 'medium' ? 'Pelo que entendi, sua dúvida é sobre este assunto. ' : ''
  return { ...interpretation, topic: interpretation.domain, escalate: [DOMAIN.SUPPORT, DOMAIN.TICKET].includes(interpretation.domain), message: `${prefix}${definition.answer({ context })}` }
}

export function knowledgeTopics() { return DEFINITIONS.map(({ id }) => id) }
export { DOMAIN as DIAG_IA_DOMAINS }
