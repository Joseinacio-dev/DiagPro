import { apiUrl } from '../config/api.js'
import { fetchAutenticado } from '../utils/auth.js'
export async function supportTickets(payload) {
  const response = await fetchAutenticado(apiUrl('/api/support/tickets/'), payload ? {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
  } : {})
  if (!response.ok) throw new Error(response.status === 429 ? 'Limite de solicitações atingido. Tente mais tarde.' : 'Atendimento indisponível. Tente novamente mais tarde.')
  return response.json()
}
