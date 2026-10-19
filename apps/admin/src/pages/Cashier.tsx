import { useCallback, useEffect, useState } from 'react'
import { brl, confirmCash, fetchPendingCash, updateOrderStatus, type Order } from '../lib/api'
import { useStaffSocket } from '../lib/useStaffSocket'

const isPendingCash = (o: Order) => o.status === 'CREATED' && o.payment?.method === 'CASH' && o.payment.status === 'PENDING'

function minutesLeft(expiresAt: string | null, now: number) {
  if (!expiresAt) return null
  const s = Math.max(0, Math.ceil((new Date(expiresAt).getTime() - now) / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/** Caixa: pedidos que o cliente vai pagar em dinheiro. Confirmar o recebimento envia o pedido à cozinha. */
export default function Cashier() {
  const [orders, setOrders] = useState<Order[]>([])
  const [error, setError] = useState<string | null>(null)
  const [now, setNow] = useState(Date.now())
  const [busy, setBusy] = useState<string | null>(null)

  const upsert = useCallback((o: Order) => {
    setOrders((prev) => {
      const without = prev.filter((p) => p.id !== o.id)
      // só fica na lista enquanto aguarda pagamento no caixa
      return isPendingCash(o) ? [...without, o].sort((a, b) => a.number - b.number) : without
    })
  }, [])

  const online = useStaffSocket({
    onCreated: upsert,
    onUpdated: upsert,
    onPending: upsert,
    onConnect: () => {
      fetchPendingCash()
        .then((list) => setOrders(list.filter(isPendingCash)))
        .catch(() => undefined)
    },
  })

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])

  const act = async (id: string, fn: () => Promise<Order>) => {
    setBusy(id)
    setError(null)
    try {
      upsert(await fn())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao atualizar o pedido')
    } finally {
      setBusy(null)
    }
  }

  const total = orders.reduce((s, o) => s + o.totalCents, 0)

  return (
    <>
      <div className="toolbar">
        <h1>Caixa</h1>
        <span className={online ? 'live on' : 'live'}>{online ? '● Ao vivo' : '○ Reconectando…'}</span>
      </div>
      {error && <p role="alert" className="error">{error}</p>}
      {orders.length === 0 ? (
        <p className="muted">Nenhum pedido aguardando pagamento.</p>
      ) : (
        <>
          <p className="muted">
            {orders.length} aguardando · a receber {brl(total)}
          </p>
          <div className="cash-list">
            {orders.map((o) => (
              <article key={o.id} className="panel cash-card">
                <header>
                  <strong className="cash-number">#{o.ticket}</strong>
                  {o.clientRef && <small className="muted">código {o.clientRef}</small>}
                  <span className="muted">expira em {minutesLeft(o.payment?.expiresAt ?? null, now)}</span>
                </header>
                <ul>
                  {o.items.map((i) => (
                    <li key={i.id}>
                      {i.qty}× {i.productName}
                    </li>
                  ))}
                </ul>
                <footer>
                  <strong className="cash-total">{brl(o.totalCents)}</strong>
                  <button className="ghost" disabled={busy === o.id} onClick={() => act(o.id, () => updateOrderStatus(o.id, 'CANCELED'))}>
                    Cancelar
                  </button>
                  <button className="primary" disabled={busy === o.id} onClick={() => act(o.id, () => confirmCash(o.id))}>
                    Recebi — confirmar
                  </button>
                </footer>
              </article>
            ))}
          </div>
        </>
      )}
    </>
  )
}
