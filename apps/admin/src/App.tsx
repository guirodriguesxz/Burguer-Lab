import { useEffect, useState } from 'react'
import { loadSession, saveSession, unauthorizedEvent, type Session } from './lib/api'
import Login from './pages/Login'
import Kitchen from './pages/Kitchen'
import Products from './pages/Products'
import Reports from './pages/Reports'
import Coupons from './pages/Coupons'

type Tab = 'kitchen' | 'products' | 'coupons' | 'reports'

export default function App() {
  const [session, setSession] = useState<Session | null>(loadSession)
  const [tab, setTab] = useState<Tab>('kitchen')

  const update = (s: Session | null) => {
    saveSession(s)
    setSession(s)
    setTab('kitchen')
  }

  // Token expirado/revogado: volta para o login.
  useEffect(() => {
    const onUnauthorized = () => update(null)
    window.addEventListener(unauthorizedEvent, onUnauthorized)
    return () => window.removeEventListener(unauthorizedEvent, onUnauthorized)
  }, [])

  if (!session) return <Login onLogin={update} />

  const isAdmin = session.user.role === 'ADMIN'
  const tabs: { id: Tab; label: string; admin?: boolean }[] = [
    { id: 'kitchen', label: '🍳 Cozinha' },
    { id: 'products', label: '📋 Cardápio', admin: true },
    { id: 'coupons', label: '🏷️ Cupons', admin: true },
    { id: 'reports', label: '📈 Relatórios', admin: true },
  ]

  return (
    <div className="shell">
      <nav>
        <strong className="brand">🍔 Burger Lab</strong>
        {tabs
          .filter((t) => !t.admin || isAdmin)
          .map((t) => (
            <button key={t.id} className={t.id === tab ? 'nav on' : 'nav'} onClick={() => setTab(t.id)}>
              {t.label}
            </button>
          ))}
        <div className="spacer" />
        <span className="muted">
          {session.user.name} · {isAdmin ? 'Admin' : 'Cozinha'}
        </span>
        <button className="nav" onClick={() => update(null)}>Sair</button>
      </nav>
      <main>
        {tab === 'kitchen' && <Kitchen token={session.token} />}
        {tab === 'products' && isAdmin && <Products token={session.token} />}
        {tab === 'coupons' && isAdmin && <Coupons token={session.token} />}
        {tab === 'reports' && isAdmin && <Reports token={session.token} />}
      </main>
    </div>
  )
}
