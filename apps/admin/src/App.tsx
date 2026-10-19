import { useEffect, useState } from 'react'
import { fetchMe, logout, unauthorizedEvent, type Session } from './lib/api'
import AccountDialog from './components/AccountDialog'
import Login from './pages/Login'
import Kitchen from './pages/Kitchen'
import Cashier from './pages/Cashier'
import OrdersHistory from './pages/OrdersHistory'
import Products from './pages/Products'
import Reports from './pages/Reports'
import Coupons from './pages/Coupons'
import Users from './pages/Users'
import AuditLog from './pages/AuditLog'

type Tab = 'kitchen' | 'cashier' | 'orders' | 'products' | 'coupons' | 'users' | 'reports' | 'audit'

/** Primeira tela de cada perfil. */
const firstTab = (s: Session | null): Tab => (s?.user.role === 'CASHIER' ? 'cashier' : 'kitchen')
const ROLE_LABEL = { ADMIN: 'Admin', KITCHEN: 'Cozinha', CASHIER: 'Caixa' } as const

export default function App() {
  // undefined = ainda descobrindo se há sessão (nada fica guardado no navegador: a sessão é um cookie HttpOnly)
  const [session, setSession] = useState<Session | null | undefined>(undefined)
  const [tab, setTab] = useState<Tab>('kitchen')
  const [account, setAccount] = useState(false)

  const start = (s: Session | null) => {
    setSession(s)
    setTab(firstTab(s))
    setAccount(false)
  }

  useEffect(() => {
    // se há reset=... na URL, a tela de login mostra a troca de senha; ainda assim confere a sessão
    fetchMe()
      .then((user) => start({ user }))
      .catch(() => start(null))
  }, [])

  // Sessão caiu (expirou, foi revogada, usuário desativado): volta para o login.
  useEffect(() => {
    const onUnauthorized = () => start(null)
    window.addEventListener(unauthorizedEvent, onUnauthorized)
    return () => window.removeEventListener(unauthorizedEvent, onUnauthorized)
  }, [])

  const signOut = async () => {
    // Encerra no servidor (revoga o token) e só então limpa a tela; se a rede falhar, sai da tela do mesmo jeito.
    await logout().catch(() => undefined)
    start(null)
  }

  if (session === undefined) return <p className="muted boot" role="status">Carregando…</p>
  if (!session) return <Login onLogin={start} />

  const isAdmin = session.user.role === 'ADMIN'
  const role = session.user.role
  const tabs: { id: Tab; label: string; admin?: boolean; roles?: string[] }[] = [
    { id: 'kitchen', label: '🍳 Cozinha', roles: ['KITCHEN', 'ADMIN'] },
    { id: 'cashier', label: '💵 Caixa', roles: ['CASHIER', 'ADMIN'] },
    { id: 'orders', label: '🧾 Pedidos', admin: true },
    { id: 'products', label: '📋 Cardápio', admin: true },
    { id: 'coupons', label: '🏷️ Cupons', admin: true },
    { id: 'reports', label: '📈 Relatórios', admin: true },
    { id: 'users', label: '👥 Usuários', admin: true },
    { id: 'audit', label: '🔎 Auditoria', admin: true },
  ]

  return (
    <div className="shell">
      <nav>
        <strong className="brand">🍔 Burger Lab</strong>
        {tabs
          .filter((t) => (!t.admin || isAdmin) && (!t.roles || t.roles.includes(role)))
          .map((t) => (
            <button key={t.id} className={t.id === tab ? 'nav on' : 'nav'} onClick={() => setTab(t.id)}>
              {t.label}
            </button>
          ))}
        <div className="spacer" />
        <span className="muted">
          {session.user.name} · {ROLE_LABEL[role]}
        </span>
        <button className="nav" onClick={() => setAccount(true)}>Minha senha</button>
        <button className="nav" onClick={signOut}>Sair</button>
      </nav>
      <main>
        {tab === 'kitchen' && <Kitchen />}
        {tab === 'cashier' && <Cashier />}
        {tab === 'orders' && isAdmin && <OrdersHistory />}
        {tab === 'products' && isAdmin && <Products />}
        {tab === 'coupons' && isAdmin && <Coupons />}
        {tab === 'reports' && isAdmin && <Reports />}
        {tab === 'users' && isAdmin && <Users myId={session.user.id} />}
        {tab === 'audit' && isAdmin && <AuditLog />}
      </main>
      {account && <AccountDialog session={session} onClose={() => setAccount(false)} />}
    </div>
  )
}
