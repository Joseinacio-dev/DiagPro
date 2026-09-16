import test from 'node:test'
import assert from 'node:assert/strict'
import { criarPayloadDiagnostico, persistirDiagnostico } from './diagnosticPersistence.mjs'

function response(status, data = {}) {
  return { status, ok: status >= 200 && status < 300, json: async () => data }
}

function resultFixture() {
  return {
    scanId: '69fc8248-1956-45cb-b9e1-4b55f4fcd209',
    status: 'partial',
    mode: 'complete',
    modules: ['system', 'apps', 'permissions', 'security', 'battery', 'storage', 'performance', 'files', 'persistence'],
    startedAt: '2026-09-12T10:00:00.000Z',
    finishedAt: '2026-09-12T10:00:12.000Z',
    durationMs: 12000,
    device: { manufacturer: 'Samsung', model: 'SM-A356E', androidVersion: '16', sdk: 36 },
    health: { available: true, score: 90, label: 'Boa', explanation: 'Sinais coletados.' },
    files: {
      status: 'partial', collectionState: 'PARTIAL', found: 2, analyzed: 2,
      items: [{ path: '/storage/emulated/0/DCIM/pessoal.jpg' }],
      attention: [{ path: '/storage/emulated/0/Download/update.apk' }],
      recentAttention: [],
      rootDiagnostics: [{ path: '/storage/emulated/0', accessible: true, found: 2 }],
    },
    fileCoverage: { status: 'partial', found: 2, analyzed: 2 },
    persistence: { status: 'partial', limitations: ['Fonte protegida.'] },
    coverage: { device: { status: 'limited' } },
    technicalCoverage: { status: 'limited', modulesProcessedPercent: 100 },
    moduleStatus: { files: 'partial', persistence: 'partial' },
    stages: { files: { status: 'partial', durationMs: 5000 } },
    warnings: [{ stage: 'files', code: 'PARTIAL_FILE_COLLECTION' }],
    limitations: ['Área privada inacessível.'],
    remediations: [],
  }
}

test('payload mantém campos do Scanner Completo e não persiste nomes de arquivos pessoais', async () => {
  const payload = criarPayloadDiagnostico(resultFixture(), 'SERIAL123')

  assert.deepEqual(payload.modulos.slice(-2), ['files', 'persistence'])
  assert.equal(payload.resultado_tecnico.fileCoverage.status, 'partial')
  assert.equal(payload.resultado_tecnico.persistence.status, 'partial')
  assert.equal(payload.resultado_tecnico.coverage.device.status, 'limited')
  assert.equal(payload.resultado_tecnico.moduleStatus.files, 'partial')
  assert.equal(payload.resultado_tecnico.durationMs, 12000)
  assert.equal(payload.resultado_tecnico.files.items, undefined)
  assert.equal(payload.resultado_tecnico.files.attention, undefined)
  assert.equal(payload.resultado_tecnico.files.attentionCount, 1)
})

for (const status of [400, 401, 500]) {
  test(`persistência expõe status HTTP ${status} sem invalidar o resultado local`, async () => {
    const calls = []
    const fetchAuthenticated = async () => {
      calls.push(true)
      return response(status, { detail: 'erro seguro' })
    }

    await assert.rejects(
      persistirDiagnostico({
        resultado: resultFixture(),
        serial: 'SERIAL123',
        accessToken: 'token-de-teste',
        diagnosticsUrl: 'https://api.example.test/api/diagnosticos/',
        fetchAuthenticated,
      }),
      (error) => error.status === status,
    )
    assert.equal(calls.length, 1)
  })
}

test('persistência bem-sucedida retorna o ID salvo', async () => {
  const saved = await persistirDiagnostico({
    resultado: resultFixture(),
    serial: 'SERIAL123',
    accessToken: 'token-de-teste',
    diagnosticsUrl: 'https://api.example.test/api/diagnosticos/',
    fetchAuthenticated: async () => response(201, { id: 42 }),
  })
  assert.equal(saved.id, 42)
})
