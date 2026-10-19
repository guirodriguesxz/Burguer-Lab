import { useEffect, useState } from 'react'
import { loadSession, saveSession, unauthorizedEvent, type Session } from './lib/api'
import AccountDialog from './components/AccountDialog'
import Login from './pages/Login'
import Kitchen from './pages/Kitchen'
import Cashier from './pages/Cashier'
import OrdersHistory from './pages/OrdersHistory'
import Products from './pages/Products'
import Reports from './pages/Reports'
import Coupons from './pages/Coupons'
import Users from './pages/Users'

type Tab = 'kitchen' | 'cashier' | 'orders' | 'products' | 'coupons' | 'users' | 'reports'

/** Primeira tela de cada perfil. */
const firstTab = (s: Session | null): Tab => (s?.user.role === 'CASHIER' ? 'cashier' : 'kitchen')
const ROLE_LABEL = { ADMIN: 'Admin', KITCHEN: 'Cozinha', CASHIER: 'Caixa' } as const

export default function App() {
  const [session, setSession] = useState<Session | null>(loadSession)
  const [tab, setTab] = useState<Tab>(firstTab(session))
  const [account, setAccount] = useState(false)

  const update = (s: Session | null) => {
    saveSession(s)
    setSession(s)
    setTab(firstTab(s))
    setAccount(false)
  }

  /** Após trocar a senha o servidor emite um token novo; a pessoa continua na mesma tela. */
  const replaceToken = (token: string) => {
    if (!session) return
    const next = { ...session, token }
    saveSession(next)
    setSession(next)
  }

  // Token expirado/revogado: volta para o login.
  useEffect(() => {
    const onUnauthorized = () => update(null)
    window.addEventListener(unauthorizedEvent, onUnauthorized)
    return () => window.removeEventListener(unauthorizedEvent, onUnauthorized)
  }, [])

  if (!session) return <Login onLogin={update} />

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
        <button className="nav" onClick={() => update(null)}>Sair</button>
      </nav>
      <main>
        {tab === 'kitchen' && <Kitchen token={session.token} />}
        {tab === 'cashier' && <Cashier token={session.token} />}
        {tab === 'orders' && isAdmin && <OrdersHistory token={session.token} />}
        {tab === 'products' && isAdmin && <Products token={session.token} />}
        {tab === 'coupons' && isAdmin && <Coupons token={session.token} />}
        {tab === 'reports' && isAdmin && <Reports token={session.token} />}
        {tab === 'users' && isAdmin && <Users token={session.token} myId={session.user.id} />}
      </main>
      {account && <AccountDialog session={session} onClose={() => setAccount(false)} onToken={replaceToken} />}
    </div>
  )
}
