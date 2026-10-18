import { useCallback, useEffect, useState } from 'react'
import { fetchOrders, updateOrderStatus } from '../lib/api'
import { brl } from '../lib/format'
import type { Order, OrderStatus } from '../lib/types'

interface ColumnProps {
  title: string
  orders: Order[]
  action?: { label: string; next: OrderStatus }
  onAction: (id: string, next: OrderStatus) => void
}

function Column({ title, orders, action, onAction }: ColumnProps) {
  return (
    <section className="kcol">
      <h2>
        {title} <span>{orders.length}</span>
      </h2>
      {orders.map((o) => (
        <article key={o.id} className="kcard">
          <header>
            <strong>#{o.number}</strong>
            <span>{o.mode === 'DINE_IN' ? '🍽️ Local' : '🛍️ Viagem'}</span>
          </header>
          <ul>
            {o.items.map((i) => (
              <li key={i.id}>
                {i.qty}× {i.productName}
                {i.extras.map((e) => (
                  <small key={e.id}>+ {e.name}</small>
                ))}
                {i.removed.map((r) => (
                  <small key={r}>sem {r}</small>
                ))}
              </li>
            ))}
          </ul>
          <footer>
            <span>
              {new Date(o.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })} · {brl(o.totalCents)}
            </span>
            {action && <button onClick={() => onAction(o.id, action.next)}>{action.label}</button>}
          </footer>
        </article>
      ))}
    </section>
  )
}

export default function Kitchen() {
  const [orders, setOrders] = useState<Order[]>([])
  const [offline, setOffline] = useState(false)

  const load = useCallback(async () => {
    try {
      setOrders(await fetchOrders(['PAID', 'PREPARING', 'READY', 'DELIVERED']))
      setOffline(false)
    } catch {
      setOffline(true)
    }
  }, [])

  // Polling simples; na próxima fase troca por WebSocket.
  useEffect(() => {
    load()
    const t = setInterval(load, 2000)
    return () => clearInterval(t)
  }, [load])

  const move = async (id: string, next: OrderStatus) => {
    await updateOrderStatus(id, next).catch(() => undefined)
    load()
  }

  const by = (...s: OrderStatus[]) => orders.filter((o) => s.includes(o.status))

  return (
    <div className="kitchen">
      <header className="khead">
        <h1>🍳 Cozinha {offline && <small>(sem conexão)</small>}</h1>
        <div>
          <a href="#/">← Totem</a>
        </div>
      </header>
      <div className="kgrid">
        <Column title="Novos" orders={by('PAID')} action={{ label: 'Preparar', next: 'PREPARING' }} onAction={move} />
        <Column title="Preparando" orders={by('PREPARING')} action={{ label: 'Pronto ✓', next: 'READY' }} onAction={move} />
        <Column title="Prontos" orders={by('READY')} action={{ label: 'Entregue', next: 'DELIVERED' }} onAction={move} />
      </div>
    </div>
  )
}
