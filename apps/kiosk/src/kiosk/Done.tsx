import { useEffect, useState } from 'react'
import type { Ticket } from './Checkout'
import PrintTicket from './PrintTicket'

export default function Done({ ticket, onFinish }: { ticket: Ticket; onFinish: () => void }) {
  const [left, setLeft] = useState(15)

  useEffect(() => {
    const t = setInterval(() => setLeft((s) => s - 1), 1000)
    return () => clearInterval(t)
  }, [])
  useEffect(() => {
    if (left <= 0) onFinish()
  }, [left, onFinish])

  // Com impressora térmica e o Chrome em modo quiosque (--kiosk-printing), imprime sozinho ao concluir.
  useEffect(() => {
    if (import.meta.env.VITE_AUTO_PRINT === 'true') window.print()
  }, [])

  return (
    <main className="done">
      <div className="check">✓</div>
      <h1>{ticket.cash ? 'Pedido registrado!' : 'Pedido confirmado!'}</h1>
      {ticket.cash && (
        <p className="cash-note">
          💵 <strong>Dirija-se ao caixa</strong> e informe {ticket.offline ? 'o código' : 'a senha'} abaixo para pagar.
          O pedido só vai para a cozinha depois do pagamento (você tem 15 minutos).
        </p>
      )}
      {ticket.offline ? (
        <>
          <p className="muted">Estamos sem conexão. Informe este código no balcão{ticket.cash ? '' : ':'}</p>
          <div className="ticket">
            <small>CÓDIGO</small>
            <strong className="code">{ticket.clientRef}</strong>
          </div>
        </>
      ) : (
        <>
          {!ticket.cash && <p className="muted">Guarde sua senha e aguarde ser chamado</p>}
          <div className="ticket">
            <small>SENHA</small>
            <strong>{ticket.number}</strong>
          </div>
        </>
      )}
      <button className="btn-ghost" onClick={() => window.print()}>🖨️ Imprimir senha</button>
      <button className="btn-primary" onClick={onFinish}>Novo pedido ({left}s)</button>
      <PrintTicket ticket={ticket} />
    </main>
  )
}
