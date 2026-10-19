import { useEffect, useState } from 'react'
import PasswordInput from '../components/PasswordInput'
import { createUser, fetchUsers, sendUserReset, updateUser, type AdminUser, type Role } from '../lib/api'

const ROLES: { value: Role; label: string }[] = [
  { value: 'ADMIN', label: 'Administrador' },
  { value: 'KITCHEN', label: 'Cozinha' },
  { value: 'CASHIER', label: 'Caixa' },
]

export default function Users({ myId }: { myId: string }) {
  const [users, setUsers] = useState<AdminUser[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<Role>('KITCHEN')
  const [password, setPassword] = useState('')

  useEffect(() => {
    fetchUsers()
      .then(setUsers)
      .catch((e) => setError(e instanceof Error ? e.message : 'Erro ao carregar'))
  }, [])

  const run = async (fn: () => Promise<void>) => {
    setError(null)
    setNotice(null)
    try {
      await fn()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Algo deu errado')
    }
  }

  const replace = (u: AdminUser) => setUsers((prev) => prev?.map((x) => (x.id === u.id ? u : x)) ?? null)

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    return run(async () => {
      const created = await createUser({ name, email, role, password })
      setUsers((prev) => [...(prev ?? []), created])
      setName('')
      setEmail('')
      setPassword('')
      setNotice(`Usuário ${created.name} criado. Combine a senha inicial com a pessoa e peça para ela trocá-la.`)
    })
  }

  return (
    <>
      <div className="toolbar">
        <h1>Usuários</h1>
        <span className="muted">Mudar o papel ou desativar encerra as sessões da pessoa na hora</span>
      </div>

      <form className="panel user-form" onSubmit={submit}>
        <div className="field">
          <label htmlFor="u-name">Nome</label>
          <input id="u-name" value={name} onChange={(e) => setName(e.target.value)} minLength={2} required />
        </div>
        <div className="field">
          <label htmlFor="u-email">E-mail</label>
          <input id="u-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
        <div className="field">
          <label htmlFor="u-role">Papel</label>
          <select id="u-role" value={role} onChange={(e) => setRole(e.target.value as Role)}>
            {ROLES.map((r) => (
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </select>
        </div>
        <PasswordInput label="Senha inicial" value={password} onChange={setPassword} autoComplete="new-password" />
        <button className="primary">Criar usuário</button>
      </form>
      <p className="muted hint">Senha: mínimo de 10 caracteres, com letras e números.</p>

      {notice && <p role="status" className="success">{notice}</p>}
      {error && <p role="alert" className="error">{error}</p>}

      {!users ? (
        <p className="muted">Carregando…</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Nome</th>
              <th>E-mail</th>
              <th>Papel</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {users.map((u) => {
              const me = u.id === myId
              return (
                <tr key={u.id} className={u.active ? '' : 'off'}>
                  <td>
                    <strong>{u.name}</strong> {me && <span className="badge-me">você</span>}
                  </td>
                  <td>{u.email}</td>
                  <td>
                    <select
                      aria-label={`Papel de ${u.name}`}
                      value={u.role}
                      disabled={me}
                      onChange={(e) => run(async () => replace(await updateUser(u.id, { role: e.target.value as Role })))}
                    >
                      {ROLES.map((r) => (
                        <option key={r.value} value={r.value}>{r.label}</option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <label className="switch">
                      <input
                        type="checkbox"
                        checked={u.active}
                        disabled={me}
                        aria-label={`${u.active ? 'Desativar' : 'Ativar'} ${u.name}`}
                        onChange={(e) => run(async () => replace(await updateUser(u.id, { active: e.target.checked })))}
                      />
                      {u.active ? 'Ativo' : 'Desativado'}
                    </label>
                  </td>
                  <td>
                    <button
                      className="ghost"
                      onClick={() => run(async () => (await sendUserReset(u.id), setNotice(`Link de redefinição enviado para ${u.email}.`)))}
                    >
                      Enviar link de senha
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </>
  )
}
