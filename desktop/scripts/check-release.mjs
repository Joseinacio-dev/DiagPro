import { loadEnv } from 'vite'
import { normalizeApiBaseUrl } from '../src/config/apiBase.mjs'

const env = { ...loadEnv('production', process.cwd(), 'VITE_'), ...process.env }
const value = env.VITE_DIAGPRO_API_BASE_URL
if (new URL(normalizeApiBaseUrl(value)).protocol !== 'https:') {
  throw new Error('A API de distribuição deve usar HTTPS.')
}
console.log('Configuração HTTPS de distribuição validada; nenhuma publicação será realizada.')
