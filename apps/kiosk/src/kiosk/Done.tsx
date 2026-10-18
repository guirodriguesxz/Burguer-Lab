import { useEffect, useState } from 'react'
import type { Order } from '../lib/types'

export default function Done({ order, onFinish }: { order: Order; onFinish: () => void }) {
  const [left, setLeft] = useState(15)

  useEffect(() => {
    const t = setInterval(() => setLeft((s) => s - 1), 1000)
    return () => clearInterval(t)
  }, [])
  useEffect(() => {
    if (left <= 0) onFinish()
  }, [left, onFinish])

  return (
    <main className="done">
      <div className="check">✓</div>
      <h1>Pedido confirmado!</h1>
      <p className="muted">Guarde sua senha e aguarde ser chamado</p>
      <div className="ticket">
        <small>SENHA</small>
        <strong>{order.number}</strong>
      </div>
      <button className="btn-primary" onClick={onFinish}>Novo pedido ({left}s)</button>
    </main>
  )
}
