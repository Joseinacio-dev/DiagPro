(() => {
  'use strict'
  const [uid, token] = location.hash.slice(1).split('/')
  history.replaceState(null, '', location.pathname)
  const byId = id => document.getElementById(id)
  const password = byId('password'), confirmation = byId('confirm'), message = byId('message')
  const strength = () => {
    const value = password.value
    const varied = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^a-zA-Z0-9]/].filter(pattern => pattern.test(value)).length
    byId('strength').textContent = value ? `Estimativa local: ${value.length >= 16 && varied >= 3 ? 'forte' : value.length >= 12 && varied >= 2 ? 'moderada' : 'fraca'}. O servidor também valida a senha.` : ''
  }
  password.addEventListener('input', strength)
  byId('show').addEventListener('change', event => { password.type = confirmation.type = event.target.checked ? 'text' : 'password' })
  byId('generate').addEventListener('click', () => {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'
    const bytes = crypto.getRandomValues(new Uint8Array(24))
    password.value = confirmation.value = Array.from(bytes, byte => alphabet[byte & 63]).join('')
    strength()
    message.textContent = 'Guarde sua nova senha em um gerenciador confiável antes de salvar.'
  })
  byId('copy').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(password.value); message.textContent = 'Copiada para a área de transferência. Proteja-a.' }
    catch { message.textContent = 'Não foi possível copiar. Selecione e copie manualmente.' }
  })
  if (!uid || !token) { message.textContent = 'Link inválido. Solicite outro pelo DiagPro.'; byId('submit').disabled = true }
  byId('reset').addEventListener('submit', async event => {
    event.preventDefault()
    if (password.value !== confirmation.value) { message.textContent = 'As senhas não conferem.'; return }
    byId('submit').disabled = true
    try {
      const response = await fetch('/api/auth/password/reset/confirm/', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'omit',
        signal: AbortSignal.timeout(15000),
        body: JSON.stringify({ uid, token, new_password1: password.value, new_password2: confirmation.value }),
      })
      const data = await response.json()
      message.textContent = [data.detail, ...Object.values(data.errors || {}).flat()].filter(Boolean).join('\n')
      if (response.ok) { password.value = confirmation.value = ''; byId('reset').hidden = true }
    } catch { message.textContent = 'Não foi possível concluir. Tente novamente.' }
    finally { byId('submit').disabled = false }
  })
})()
