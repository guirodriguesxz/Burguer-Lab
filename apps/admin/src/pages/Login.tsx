import { useState } from 'react'
import { login, type Session } from '../lib/api'

export default function Login({ onLogin }: { onLogin: (s: Session) => void }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      onLogin(await login(email, password))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha no login')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="login">
      <form onSubmit={submit}>
        <h1>🍔 Burger Lab</h1>
        <p className="muted">Acesso da equipe</p>
        <label>
          E-mail
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" required />
        </label>
        <label>
          Senha
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
        </label>
        {error && <p role="alert" className="error">{error}</p>}
        <button className="primary" disabled={loading}>{loading ? 'Entrando…' : 'Entrar'}</button>
      </form>
    </main>
  )
}
