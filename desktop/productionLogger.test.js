const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')
const test = require('node:test')

const { createProductionLogger, sanitizeDetails } = require('./productionLogger')

test('logger mantém somente metadados operacionais permitidos', () => {
  assert.deepEqual(sanitizeDetails({
    code: 'ADB_NOT_FOUND',
    serial: 'DEVICE-SECRET',
    token: 'JWT-SECRET',
    password: 'PASSWORD-SECRET',
  }), { code: 'ADB_NOT_FOUND' })
})

test('logger grava evento estruturado sem conteúdo sensível', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'diagpro-log-'))
  try {
    const logger = createProductionLogger({
      directory,
      now: () => new Date('2026-09-04T12:00:00.000Z'),
    })
    logger.error('api_unavailable', { code: 'NETWORK_ERROR', refreshToken: 'SECRET' })
    const entry = JSON.parse(fs.readFileSync(logger.filePath, 'utf8'))
    assert.deepEqual(entry, {
      timestamp: '2026-09-04T12:00:00.000Z',
      level: 'error',
      event: 'api_unavailable',
      code: 'NETWORK_ERROR',
    })
  } finally {
    fs.rmSync(directory, { recursive: true, force: true })
  }
})

test('logger aceita estado técnico mas rejeita credenciais em qualquer evento', () => {
  assert.deepEqual(sanitizeDetails({
    state: 'ADB_UNAVAILABLE', mode: 'complete', moduleCount: 9,
    password: 'SECRET', accessToken: 'SECRET', refreshToken: 'SECRET', databaseUrl: 'SECRET',
  }), { state: 'ADB_UNAVAILABLE', mode: 'complete', moduleCount: 9 })
})

test('logger de arquivos registra apenas diagnóstico agregado da raiz', () => {
  assert.deepEqual(sanitizeDetails({
    root: '/storage/emulated/0', state: 'partial', errorType: 'COMMAND_NOT_SUPPORTED',
    exitCode: 1, durationMs: 245, found: 17,
    fileName: 'foto-pessoal.jpg', path: '/storage/emulated/0/DCIM/foto-pessoal.jpg',
  }), {
    root: '/storage/emulated/0', state: 'partial', errorType: 'COMMAND_NOT_SUPPORTED',
    exitCode: 1, durationMs: 245, found: 17,
  })
})
