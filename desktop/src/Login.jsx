import { useState } from 'react'
import { User, Lock, Eye, EyeOff, ArrowRight, ShieldCheck, LineChart, Zap, Headphones } from 'lucide-react'
import { API_BASE_URL, apiUrl } from './config/api.js'
import { fetchApi } from './utils/auth.js'
import { cancelGoogleLogin, executeGoogleLogin } from './utils/googleLogin.mjs'
import './Login.css'

const features = [
  { icon: LineChart, title: 'Análises precisas', desc: 'Informações detalhadas e confiáveis.' },
  { icon: ShieldCheck, title: 'Segurança avançada', desc: 'Seus dados protegidos com tecnologia de ponta.' },
  { icon: Zap, title: 'Mais eficiência', desc: 'Agilidade no diagnóstico e no atendimento.' },
]

function Login({ onLoginSuccess, startupStatus, deviceStatus }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [remember, setRemember] = useState(true)
  const [erro, setErro] = useState('')
  const [carregando, setCarregando] = useState(false)
  const [googleCarregando, setGoogleCarregando] = useState(false)
  const [recovering, setRecovering] = useState(false)
  const [email, setEmail] = useState('')
  const [recoveryMessage, setRecoveryMessage] = useState('')
  const apiStatus = startupStatus?.api?.status || 'checking'
  const backendReady = apiStatus === 'online'
  const adbReady = !['adb_unavailable', 'error'].includes(deviceStatus?.status)

  async function requestRecovery(event) {
    event.preventDefault()
    setCarregando(true)
    setRecoveryMessage('')
    try {
      const response = await fetchApi(apiUrl('/api/auth/password/reset/'), {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }),
      })
      setRecoveryMessage(response.ok ? 'Se houver uma conta elegível, você receberá um link por e-mail. Verifique também o spam.'
        : response.status === 429 ? 'Muitas solicitações. Aguarde antes de tentar novamente.'
          : 'Recuperação temporariamente indisponível. Contate o suporte.')
    } catch { setRecoveryMessage('Não foi possível conectar ao servidor. Tente novamente.') }
    finally { setCarregando(false) }
  }

  async function handleLogin(e) {
    e.preventDefault()
    if (carregando || googleCarregando) return
    setErro('')
    setCarregando(true)

    try {
      const resposta = await fetchApi(apiUrl('/api/token/'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      })

      if (!resposta.ok) {
        throw new Error(resposta.status === 401 ? 'Usuário ou senha inválidos'
          : resposta.status === 429 ? 'Muitas tentativas. Aguarde e tente novamente.'
            : 'Serviço de login temporariamente indisponível.')
      }

            const dados = await resposta.json()
      await onLoginSuccess(dados.access, dados.refresh, username, remember)
    } catch (err) {
      setErro(['TypeError', 'TimeoutError'].includes(err?.name)
        ? 'Não foi possível conectar à API do DiagPro.'
        : err.message)
    } finally {
      setCarregando(false)
    }
  }

  async function handleGoogleLogin() {
    if (googleCarregando) {
      await cancelGoogleLogin(window.diagpro)
      return
    }
    if (!window.diagpro?.startGoogleAuth) {
      setErro('Login com Google indisponível nesta instalação.')
      return
    }
    await executeGoogleLogin({
      bridge: window.diagpro,
      apiBaseUrl: API_BASE_URL,
      remember,
      onLoading: setGoogleCarregando,
      onSuccess: onLoginSuccess,
      onError: setErro,
    })
  }

  return (
    <div className="dp-login-page">
      <div className="dp-login-left">
        <div className="dp-login-logo-row">
          <img src="./logo.png" alt="DiagPro" />
          <div className="dp-login-brand">Diag<span>Pro</span></div>
        </div>

        <h1 className="dp-login-tagline">
          Diagnóstico inteligente para sua <span>assistência técnica.</span>
        </h1>
        <p className="dp-login-subtext">
          Analise, identifique e acompanhe dispositivos com precisão e segurança.
        </p>

        <div className="dp-login-features">
          {features.map((f) => (
            <div className="dp-login-feature" key={f.title}>
              <div className="dp-login-feature-icon"><f.icon size={18} /></div>
              <div>
                <div className="dp-login-feature-title">{f.title}</div>
                <div className="dp-login-feature-desc">{f.desc}</div>
              </div>
            </div>
          ))}
        </div>

        <div className="dp-login-left-footer">© 2026 DiagPro. Todos os direitos reservados.</div>
      </div>

      <div className="dp-login-right">
        {recovering ? <form className="dp-login-card" onSubmit={requestRecovery}>
          <h1>Recuperar <span>senha</span></h1>
          <p>Informe o e-mail cadastrado. Contas criadas apenas com Google devem usar Continuar com Google.</p>
          <div className="dp-field"><label htmlFor="recovery-email">E-mail</label>
            <div className="dp-input-wrap"><input id="recovery-email" type="email" autoComplete="email" maxLength={254} required value={email} onChange={event => setEmail(event.target.value)} /></div></div>
          <p role="status">{recoveryMessage}</p>
          <button type="submit" className="dp-login-submit" disabled={carregando}>{carregando ? 'Enviando…' : 'Solicitar link'}</button>
          <button type="button" className="dp-forgot-link" onClick={() => setRecovering(false)}>Voltar ao login</button>
        </form> :
        <form className="dp-login-card" onSubmit={handleLogin}>
          <h1>Bem-vindo ao <span>DiagPro</span></h1>
          <p>Acesse sua central de diagnóstico</p>

          <div className="dp-login-startup" aria-live="polite">
            <div className={apiStatus}>
              <span />
              {apiStatus === 'checking' ? 'Conectando ao servidor DiagPro…' : apiStatus === 'online' ? 'API online' : 'API temporariamente indisponível'}
              {apiStatus === 'offline' && <button type="button" onClick={startupStatus?.checkApi}>Tentar novamente</button>}
            </div>
            <div className={adbReady ? 'online' : 'offline'}><span />{adbReady ? 'ADB pronto' : 'ADB indisponível'}</div>
          </div>

          {erro && <div className="dp-login-error">{erro}</div>}

          <div className="dp-field">
            <label>Usuário ou e-mail</label>
            <div className="dp-input-wrap">
              <User size={16} />
              <input
                type="text"
                autoComplete="username"
                placeholder="Digite seu usuário ou e-mail"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="dp-field">
            <label>Senha</label>
            <div className="dp-input-wrap">
              <Lock size={16} />
              <input
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                placeholder="Digite sua senha"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              <button type="button" onClick={() => setShowPassword(!showPassword)}>
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          <div className="dp-field-row">
            <label className="dp-remember">
              <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
              Lembrar-me
            </label>
            <button
              type="button"
              className="dp-forgot-link"
              onClick={() => { setRecovering(true); setRecoveryMessage('') }}
            >
              Esqueci minha senha
            </button>
          </div>

          <button type="submit" className="dp-login-submit" disabled={carregando || !backendReady}>
            {carregando ? 'Entrando...' : 'Entrar'} <ArrowRight size={16} />
          </button>

          <div className="dp-login-divider">ou</div>

          <button
            type="button"
            className="dp-google-btn"
            onClick={handleGoogleLogin}
            disabled={carregando || !backendReady}
            aria-busy={googleCarregando}
          >
            <svg width="18" height="18" viewBox="0 0 18 18"><path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84c-.21 1.13-.84 2.09-1.8 2.73v2.27h2.91c1.7-1.57 2.69-3.88 2.69-6.64z"/><path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.91-2.27c-.81.54-1.84.86-3.05.86-2.35 0-4.34-1.58-5.05-3.71H.96v2.34C2.44 15.98 5.48 18 9 18z"/><path fill="#FBBC05" d="M3.95 10.7A5.4 5.4 0 0 1 3.68 9c0-.59.1-1.17.27-1.7V4.96H.96A9 9 0 0 0 0 9c0 1.45.35 2.83.96 4.04l2.99-2.34z"/><path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0 5.48 0 2.44 2.02.96 4.96l2.99 2.34C4.66 5.16 6.65 3.58 9 3.58z"/></svg>
            {googleCarregando ? 'Cancelar login com Google' : 'Continuar com Google'}
          </button>

          <div className="dp-login-secure">
            <ShieldCheck size={14} /> Ambiente seguro e criptografado
          </div>
        </form>}

        <div className="dp-login-right-footer">
          <Headphones size={14} /> Precisa de ajuda? <a href="#">Fale conosco</a>
        </div>
      </div>
    </div>
  )
}

export default Login
