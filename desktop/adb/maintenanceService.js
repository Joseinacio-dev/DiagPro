const { createAdbClient, isValidSerial } = require('./adbClient')
const { createAdbError } = require('./adbErrors')
const { parseAdbDevices, parseMemory, parseStorage } = require('../security/parsers/adbParsers')
const { createAndroidBatteryProvider } = require('../deviceProviders')

const UNAVAILABLE = 'Não disponível neste dispositivo'
const TERMINAL = new Set(['ADB_NOT_FOUND', 'DEVICE_NOT_FOUND', 'DEVICE_DISCONNECTED', 'DEVICE_OFFLINE', 'DEVICE_UNAUTHORIZED', 'SCAN_ABORTED', 'OPERATION_CANCELED'])
const rejectedOutput = /permission denial|permission denied|securityexception|can't find service|cannot find service|unknown command|unknown option|not supported|exception occurred/i

function numericField(text, key, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  const match = String(text).match(new RegExp(`^\\s*${key}:\\s*(-?\\d+(?:\\.\\d+)?)\\s*$`, 'mi'))
  if (!match) return null
  const value = Number(match[1])
  return Number.isFinite(value) && value >= min && value <= max ? value : null
}

function booleanField(text, key) {
  const match = String(text).match(new RegExp(`^\\s*${key}:\\s*(true|false)\\s*$`, 'mi'))
  return match ? match[1].toLowerCase() === 'true' : null
}

function textField(text, key) {
  const match = String(text).match(new RegExp(`^\\s*${key}:\\s*([^\\r\\n]{1,80})\\s*$`, 'mi'))
  const value = match?.[1]?.trim()
  return value && !rejectedOutput.test(value) ? value : null
}

function batteryFields(text) {
  // Android can expose values overridden by dumpsys battery set; do not present them as live readings.
  if (/UPDATES STOPPED/i.test(text)) return [['Leitura física', null]]
  const level = numericField(text, 'level')
  const scale = numericField(text, 'scale', { min: 1 })
  const status = numericField(text, 'status', { min: 1, max: 5 })
  const health = numericField(text, 'health', { min: 1, max: 7 })
  const temperature = numericField(text, 'temperature', { min: -1000, max: 2000 })
  const voltage = numericField(text, 'voltage', { min: 1, max: 100000 })
  const acPowered = booleanField(text, 'AC powered')
  const usbPowered = booleanField(text, 'USB powered')
  const wirelessPowered = booleanField(text, 'Wireless powered')
  const dockPowered = booleanField(text, 'Dock powered')
  const present = booleanField(text, 'present')
  const technology = textField(text, 'technology')
  const chargeCounter = numericField(text, 'Charge counter', { min: -1_000_000_000, max: 1_000_000_000 })
  const currentNow = numericField(text, 'current(?:_| )now', { min: -1_000_000_000, max: 1_000_000_000 })
  const sources = [
    acPowered === true ? 'AC' : null,
    usbPowered === true ? 'USB' : null,
    wirelessPowered === true ? 'Sem fio' : null,
    dockPowered === true ? 'Dock' : null,
  ].filter(Boolean)
  const sourceKnown = [acPowered, usbPowered, wirelessPowered, dockPowered].some(value => value !== null)
  return [
    ['Carga', level !== null && scale !== null && level <= scale ? `${Math.round(level / scale * 100)}%` : null],
    ['Estado', ({ 2: 'Carregando', 3: 'Descarregando', 4: 'Não carregando', 5: 'Completa' })[status] || null],
    ['Fonte de alimentação', sourceKnown ? (sources.join(', ') || 'Nenhuma fonte externa reportada') : null],
    ['Alimentação AC', acPowered === null ? null : acPowered ? 'Sim' : 'Não'],
    ['Alimentação USB', usbPowered === null ? null : usbPowered ? 'Sim' : 'Não'],
    ['Carregamento sem fio', wirelessPowered === null ? null : wirelessPowered ? 'Sim' : 'Não'],
    ['Bateria presente', present === null ? null : present ? 'Sim' : 'Não'],
    ['Condição reportada pelo Android', ({ 2: 'Boa', 3: 'Superaquecimento', 4: 'Falha', 5: 'Sobretensão', 6: 'Falha não especificada', 7: 'Fria' })[health] || null],
    ['Temperatura', temperature !== null ? `${temperature / 10} °C` : null],
    ['Tensão', voltage !== null ? `${voltage} mV` : null],
    ['Tecnologia', technology],
    ['Corrente atual', currentNow !== null ? `${currentNow} µA` : null],
    ['Contador de carga', chargeCounter !== null ? `${chargeCounter} µAh` : null],
  ]
}

function createMaintenanceService({ adb = createAdbClient(), now = () => new Date().toISOString() } = {}) {
  async function inspect({ serial, action, signal } = {}) {
    if (!isValidSerial(serial)) throw createAdbError('INVALID_DEVICE')
    if (!['cleanup', 'optimization', 'battery', 'backup'].includes(action)) throw createAdbError('INVALID_ARGUMENTS')
    const options = { signal, timeout: 15000, maxBuffer: 2 * 1024 * 1024 }
    const checkConnected = async () => {
      if (signal?.aborted) throw signal.reason || createAdbError('OPERATION_CANCELED')
      const device = parseAdbDevices(await adb.run(['devices', '-l'], options)).find(item => item.serial === serial)
      if (!device) throw createAdbError('DEVICE_DISCONNECTED')
      if (device.status === 'unauthorized') throw createAdbError('DEVICE_UNAUTHORIZED')
      if (device.status !== 'device') throw createAdbError('DEVICE_OFFLINE')
    }
    await checkConnected()
    const sections = []
    const notes = []
    async function collect(label, args, parser, host = false) {
      let section
      try {
        const text = host ? await adb.run(args, options) : await adb.runDevice(serial, ['shell', ...args], options)
        if (rejectedOutput.test(text)) {
          section = { label, status: 'unavailable', reason: 'Permissão negada ou comando não suportado.', fields: [] }
        } else {
          const fields = parser(text).map(([name, value]) => ({ name, value }))
          const known = fields.filter(field => field.value !== null).length
          section = { label, status: known === 0 ? 'unavailable' : known < fields.length ? 'partial' : 'available', fields,
            reason: known === 0 ? 'A saída não contém dados reconhecidos.' : null }
        }
      } catch (error) {
        if (signal?.aborted || TERMINAL.has(error.code || error.codigo)) throw error
        section = { label, status: 'unavailable', reason: error.code === 'ADB_TIMEOUT' ? 'Tempo limite da consulta excedido.' : 'Consulta falhou ou não foi autorizada pelo Android.', fields: [] }
      }
      sections.push(section)
      return section
    }
    const storage = () => collect('Armazenamento interno', ['df', '-k', '/data'], text => {
      const value = parseStorage(text)
      return [['Total', value.totalGb === null ? null : `${value.totalGb} GB`], ['Livre', value.freeGb === null ? null : `${value.freeGb} GB`], ['Uso', value.usagePercent === null ? null : `${value.usagePercent}%`]]
    })
    if (action === 'cleanup') {
      await storage()
      await collect('Cache agregado reportado pelo Android', ['dumpsys', 'diskstats'], text => {
        const bytes = numericField(text, 'App Cache Size')
        return [['Cache de aplicativos (snapshot do Android)', bytes === null ? null : `${bytes} bytes`]]
      })
      await collect('Capacidade do gerenciador de pacotes', ['pm', 'help'], text => [
        ['Limpeza global de cache anunciada', /\btrim-caches\s+/.test(text) ? 'Sim; execução não habilitada nesta versão' : null],
      ])
      notes.push('Preview somente de leitura. Nenhum arquivo será excluído.',
        'O cache agregado pode estar desatualizado e não equivale ao espaço recuperável. Não há lista de arquivos cuja exclusão segura tenha sido validada.',
        'A limpeza global do Android não permite um preview exato dos arquivos afetados. A presença do comando não comprova permissão para executá-lo.',
        'Limpeza seletiva: não disponível neste dispositivo por este fluxo. Pastas pessoais, downloads, armazenamento de apps e temporários sem origem comprovada não são candidatos.')
    }
    if (action === 'optimization') {
      await storage()
      const memory = await collect('Memória do sistema', ['cat', '/proc/meminfo'], text => {
        const data = parseMemory(text)
        // MemFree alone is not equivalent to available memory.
        const available = /^MemAvailable:\s*\d+\s+kB\s*$/mi.test(text) ? data.availableGb : null
        return [['RAM total', data.totalGb === null ? null : `${data.totalGb} GB`], ['RAM disponível estimada pelo kernel', available === null ? null : `${available} GB`]]
      })
      await collect('Carga de CPU observada', ['dumpsys', 'cpuinfo'], text => {
        const line = text.split(/\r?\n/).find(line => /^\s*[\d.]+%\s+TOTAL:/.test(line))
        return [['Amostra do sistema', line?.trim() || null]]
      })
      notes.push('Diagnóstico pontual e com cobertura parcial. Não mede ganho de desempenho e não altera processos, animações ou configurações.',
        'Sugestão: compare leituras em repouso e durante o problema antes de intervir. Revise aplicativos pelo gerenciador existente.')
      if (memory.status !== 'available') notes.push('A leitura de memória está incompleta; não é possível concluir se há pressão de RAM.')
    }
    if (action === 'battery') {
      const provider = createAndroidBatteryProvider({ collect: (label, args) => collect(label, args, batteryFields) })
      await provider.inspect()
      for (const [label, path] of [
        ['Corrente média', '/sys/class/power_supply/battery/current_avg'],
        ['Ciclos reportados', '/sys/class/power_supply/battery/cycle_count'],
        ['Capacidade total reportada', '/sys/class/power_supply/battery/charge_full'],
        ['Capacidade de projeto reportada', '/sys/class/power_supply/battery/charge_full_design'],
      ]) {
        await collect(label, ['cat', path], text => {
          const value = String(text).trim()
          return [[label, /^[-+]?\d{1,15}$/.test(value) ? value : null]]
        })
      }
      notes.push('Consulta restrita ao estado atual da bateria; o histórico de uso por aplicativo não é coletado.')
      notes.push('Cobertura parcial: as leituras dependem do fabricante, das permissões e da janela de coleta do Android.',
        'Se o Android informar UPDATES STOPPED (valores simulados), a leitura física fica indisponível. O DiagPro não altera esse estado.',
        'A condição reportada pelo Android não é uma medição de capacidade restante, desgaste ou autonomia. Nenhuma estatística foi zerada.')
    }
    if (action === 'backup') {
      await collect('Android', ['getprop', 'ro.build.version.sdk'], text => [['API do Android', /^\d+$/.test(text.trim()) ? Number(text.trim()) : null]])
      await collect('ADB instalado no computador', ['version'], text => [['Versão', text.match(/Android Debug Bridge version\s+([^\r\n]+)/)?.[1] || null]], true)
      await collect('Recursos anunciados pelo ADB local', ['help'], text => [
        ['Cópia de arquivos (pull)', /^\s*pull\s/m.test(text) ? 'Comando presente; acesso aos arquivos não validado' : null],
        ['Backup legado', /^\s*backup\s/m.test(text) ? 'Comando presente; integridade e restauração não validadas' : null],
      ], true)
      notes.push('Backup completo não disponível neste dispositivo por este fluxo. Nenhum backup foi criado.',
        'A existência de comandos no ADB não garante acesso aos dados nem restauração confiável. O acesso a arquivos compartilhados ainda precisa ser validado.',
        'Android 12 ou superior restringe dados de apps que usam API alvo 31 ou superior no backup legado. Apps e fabricantes também podem impor restrições.',
        'Use um método de backup suportado pelo fabricante ou pelo próprio aplicativo e verifique a restauração antes de depender da cópia.')
    }
    await checkConnected()
    return { serial, action, collectedAt: now(), coverage: sections.every(section => section.status === 'unavailable') ? 'unavailable' : 'partial', sections, notes, canExecute: false, candidates: [] }
  }
  return { inspect }
}

module.exports = { createMaintenanceService, batteryFields, booleanField, numericField, textField, UNAVAILABLE }
