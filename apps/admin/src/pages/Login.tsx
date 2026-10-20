import { useEffect, useState } from 'react'
import PasswordInput from '../components/PasswordInput'
import { fetchDemo, forgotPassword, login, type DemoInfo, resetPassword, type Session } from '../lib/api'

type Mode = 'login' | 'forgot' | 'forgot-sent' | 'reset'

/** Token de redefinição vindo do link do e-mail (?reset=...). */
const tokenFromUrl = () => new URLSearchParams(window.location.search).get('reset')

export default function Login({ onLogin }: { onLogin: (s: Session) => void }) {
  const [mode, setMode] = useState<Mode>(tokenFromUrl() ? 'reset' : 'login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [demo, setDemo] = useState<DemoInfo | null>(null)
  useEffect(() => {
    fetchDemo().then(setDemo).catch(() => {})
  }, [])

  const go = (next: Mode) => {
    setMode(next)
    setError(null)
    setPassword('')
    setConfirm('')
  }

  const run = async (fn: () => Promise<void>) => {
    setLoading(true)
    setError(null)
    try {
      await fn()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Algo deu errado. Tente de novo.')
    } finally {
      setLoading(false)
    }
  }

  const submitLogin = (e: React.FormEvent) => {
    e.preventDefault()
    setNotice(null)
    return run(async () => onLogin(await login(email, password)))
  }

  const submitForgot = (e: React.FormEvent) => {
    e.preventDefault()
    return run(async () => {
      await forgotPassword(email)
      setMode('forgot-sent')
    })
  }

  const submitReset = (e: React.FormEvent) => {
    e.preventDefault()
    if (password !== confirm) return setError('As senhas não são iguais')
    return run(async () => {
      await resetPassword(tokenFromUrl() ?? '', password)
      window.history.replaceState(null, '', window.location.pathname) // tira o token da URL
      setNotice('Senha alterada! Entre com a nova senha.')
      go('login')
    })
  }

  return (
    <main className="login">
      {mode === 'login' && (
        <form onSubmit={submitLogin}>
          <h1>🍔 Burger Lab</h1>
          <p className="muted">Acesso da equipe</p>
          {notice && <p role="status" className="success">{notice}</p>}
          <label>
            E-mail
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" required />
          </label>
          <PasswordInput label="Senha" value={password} onChange={setPassword} autoComplete="current-password" />
          {error && <p role="alert" className="error">{error}</p>}
          <button className="primary" disabled={loading}>{loading ? 'Entrando…' : 'Entrar'}</button>
          {demo?.demo && demo.logins.length > 0 && (
            <section className="demo-logins" aria-label="Contas de demonstração">
              <p className="muted">Demonstração: escolha um perfil para preencher o login.</p>
              {demo.logins.map((l) => (
                <button key={l.email} type="button" className="ghost" onClick={() => (setEmail(l.email), setPassword(l.password))}>
                  {l.label}
                </button>
              ))}
            </section>
          )}
          <button type="button" className="link" onClick={() => go('forgot')}>Esqueci minha senha</button>
        </form>
      )}

      {mode === 'forgot' && (
        <form onSubmit={submitForgot}>
          <h1>Redefinir senha</h1>
          <p className="muted">Informe seu e-mail e enviaremos um link para criar uma nova senha.</p>
          <label>
            E-mail
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" required />
          </label>
          {error && <p role="alert" className="error">{error}</p>}
          <button className="primary" disabled={loading}>{loading ? 'Enviando…' : 'Enviar link'}</button>
          <button type="button" className="link" onClick={() => go('login')}>Voltar ao login</button>
        </form>
      )}

      {mode === 'forgot-sent' && (
        <form onSubmit={(e) => e.preventDefault()}>
          <h1>Verifique seu e-mail</h1>
          <p role="status">Se o e-mail estiver cadastrado, enviamos um link para redefinir a senha. Ele vale por 30 minutos.</p>
          <button type="button" className="primary" onClick={() => go('login')}>Voltar ao login</button>
        </form>
      )}

      {mode === 'reset' && (
        <form onSubmit={submitReset}>
          <h1>Nova senha</h1>
          <p className="muted">Mínimo de 10 caracteres, com letras e números.</p>
          <PasswordInput label="Nova senha" value={password} onChange={setPassword} autoComplete="new-password" />
          <PasswordInput label="Repita a nova senha" value={confirm} onChange={setConfirm} autoComplete="new-password" />
          {error && <p role="alert" className="error">{error}</p>}
          <button className="primary" disabled={loading}>{loading ? 'Salvando…' : 'Salvar nova senha'}</button>
          <button type="button" className="link" onClick={() => (window.history.replaceState(null, '', window.location.pathname), go('login'))}>
            Cancelar
          </button>
        </form>
      )}
    </main>
  )
}
