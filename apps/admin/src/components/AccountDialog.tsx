import { useState } from 'react'
import { changePassword, type Session } from '../lib/api'
import { useDialog } from '../lib/useDialog'
import PasswordInput from './PasswordInput'

/** "Alterar minha senha": pede a senha atual; as outras sessões caem e esta continua com um cookie novo. */
export default function AccountDialog({ session, onClose }: { session: Session; onClose: () => void }) {
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [loading, setLoading] = useState(false)
  const ref = useDialog<HTMLFormElement>(onClose)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (next !== confirm) return setError('As senhas não são iguais')
    setLoading(true)
    setError(null)
    try {
      await changePassword(current, next)
      setDone(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível trocar a senha')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label="Alterar minha senha">
      <form className="dialog" onSubmit={submit} ref={ref} tabIndex={-1}>
        <h2>Alterar minha senha</h2>
        <p className="muted">{session.user.email}</p>
        {done ? (
          <>
            <p role="status" className="success">Senha alterada. Seus outros acessos foram encerrados.</p>
            <button type="button" className="primary" onClick={onClose}>Fechar</button>
          </>
        ) : (
          <>
            <PasswordInput label="Senha atual" value={current} onChange={setCurrent} autoComplete="current-password" />
            <PasswordInput label="Nova senha" value={next} onChange={setNext} autoComplete="new-password" />
            <PasswordInput label="Repita a nova senha" value={confirm} onChange={setConfirm} autoComplete="new-password" />
            <p className="muted hint">Mínimo de 10 caracteres, com letras e números.</p>
            {error && <p role="alert" className="error">{error}</p>}
            <div className="dialog-actions">
              <button type="button" className="ghost" onClick={onClose}>Cancelar</button>
              <button className="primary" disabled={loading}>{loading ? 'Salvando…' : 'Salvar'}</button>
            </div>
          </>
        )}
      </form>
    </div>
  )
}
