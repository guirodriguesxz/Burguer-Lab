import { useEffect, useState } from 'react'
import type { Ticket } from './Checkout'

export default function Done({ ticket, onFinish }: { ticket: Ticket; onFinish: () => void }) {
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
      {ticket.offline ? (
        <>
          <p className="muted">Estamos sem conexão. Informe este código no balcão:</p>
          <div className="ticket">
            <small>CÓDIGO</small>
            <strong className="code">{ticket.clientRef}</strong>
          </div>
        </>
      ) : (
        <>
          <p className="muted">Guarde sua senha e aguarde ser chamado</p>
          <div className="ticket">
            <small>SENHA</small>
            <strong>{ticket.number}</strong>
          </div>
        </>
      )}
      <button className="btn-primary" onClick={onFinish}>Novo pedido ({left}s)</button>
    </main>
  )
}
