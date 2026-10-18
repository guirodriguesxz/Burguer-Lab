import { useCallback, useState } from 'react'
import { brl, fetchOrders, updateOrderStatus, type Order, type OrderStatus } from '../lib/api'
import { useStaffSocket } from '../lib/useStaffSocket'

interface ColumnProps {
  title: string
  orders: Order[]
  action: { label: string; next: OrderStatus }
  onAction: (id: string, next: OrderStatus) => void
}

function Column({ title, orders, action, onAction }: ColumnProps) {
  return (
    <section className="kcol">
      <h2>
        {title} <span className="badge">{orders.length}</span>
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
            <button onClick={() => onAction(o.id, action.next)}>{action.label}</button>
          </footer>
        </article>
      ))}
    </section>
  )
}

export default function Kitchen({ token }: { token: string }) {
  const [orders, setOrders] = useState<Order[]>([])
  const [error, setError] = useState<string | null>(null)

  const upsert = useCallback((o: Order) => {
    setOrders((prev) => (prev.some((p) => p.id === o.id) ? prev.map((p) => (p.id === o.id ? o : p)) : [...prev, o]))
  }, [])

  const online = useStaffSocket(token, {
    onCreated: upsert,
    onUpdated: upsert,
    onConnect: () => {
      fetchOrders(token).then(setOrders).catch(() => undefined)
    },
  })

  const move = async (id: string, next: OrderStatus) => {
    setError(null)
    try {
      upsert(await updateOrderStatus(token, id, next))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao atualizar o pedido')
    }
  }

  const by = (s: OrderStatus) => orders.filter((o) => o.status === s)

  return (
    <>
      <div className="toolbar">
        <h1>Cozinha</h1>
        <span className={online ? 'live on' : 'live'}>{online ? '● Ao vivo' : '○ Reconectando…'}</span>
      </div>
      {error && <p role="alert" className="error">{error}</p>}
      <div className="kgrid">
        <Column title="Novos" orders={by('PAID')} action={{ label: 'Preparar', next: 'PREPARING' }} onAction={move} />
        <Column title="Preparando" orders={by('PREPARING')} action={{ label: 'Pronto ✓', next: 'READY' }} onAction={move} />
        <Column title="Prontos" orders={by('READY')} action={{ label: 'Entregue', next: 'DELIVERED' }} onAction={move} />
      </div>
    </>
  )
}
