import { useCallback, useState } from 'react'
import { brl, fetchOrders, updateOrderStatus, type Order, type OrderStatus } from '../lib/api'
import { useStaffSocket } from '../lib/useStaffSocket'
import Comanda, { usePrint } from '../components/Comanda'

interface ColumnProps {
  title: string
  orders: Order[]
  action: { label: string; next: OrderStatus }
  onAction: (id: string, next: OrderStatus) => void
  onPrint: (o: Order) => void
}

function Column({ title, orders, action, onAction, onPrint }: ColumnProps) {
  return (
    <section className="kcol">
      <h2>
        {title} <span className="badge">{orders.length}</span>
      </h2>
      {orders.map((o) => (
        <article key={o.id} className="kcard">
          <header>
            <strong>
              #{o.ticket}
              {o.clientRef && <small className="ref">código {o.clientRef}</small>}
            </strong>
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
            <span className="kactions">
              <button className="icon" aria-label={`Imprimir comanda #${o.ticket}`} title="Imprimir comanda" onClick={() => onPrint(o)}>🖨️</button>
              <button onClick={() => onAction(o.id, action.next)}>{action.label}</button>
            </span>
          </footer>
        </article>
      ))}
    </section>
  )
}

export default function Kitchen() {
  const [orders, setOrders] = useState<Order[]>([])
  const [error, setError] = useState<string | null>(null)

  const upsert = useCallback((o: Order) => {
    setOrders((prev) => (prev.some((p) => p.id === o.id) ? prev.map((p) => (p.id === o.id ? o : p)) : [...prev, o]))
  }, [])

  const online = useStaffSocket({
    onCreated: upsert,
    onUpdated: upsert,
    onConnect: () => {
      fetchOrders().then(setOrders).catch(() => undefined)
    },
  })

  const move = async (id: string, next: OrderStatus) => {
    setError(null)
    try {
      upsert(await updateOrderStatus(id, next))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao atualizar o pedido')
    }
  }

  const by = (s: OrderStatus) => orders.filter((o) => o.status === s)
  const { printing, print } = usePrint()

  return (
    <>
      <div className="toolbar">
        <h1>Cozinha</h1>
        <span className={online ? 'live on' : 'live'}>{online ? '● Ao vivo' : '○ Reconectando…'}</span>
      </div>
      {error && <p role="alert" className="error">{error}</p>}
      <div className="kgrid">
        <Column title="Novos" orders={by('PAID')} action={{ label: 'Preparar', next: 'PREPARING' }} onAction={move} onPrint={print} />
        <Column title="Preparando" orders={by('PREPARING')} action={{ label: 'Pronto ✓', next: 'READY' }} onAction={move} onPrint={print} />
        <Column title="Prontos" orders={by('READY')} action={{ label: 'Entregue', next: 'DELIVERED' }} onAction={move} onPrint={print} />
      </div>
      <Comanda order={printing} />
    </>
  )
}
