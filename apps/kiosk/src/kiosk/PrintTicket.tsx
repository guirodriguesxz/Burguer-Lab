import { brl } from '../lib/format'
import type { Ticket } from './Checkout'

const METHOD = { PIX: 'Pix', CARD: 'Cartão', CASH: 'Dinheiro (pagar no caixa)' } as const

/**
 * Comprovante para impressora térmica de 80 mm. Fica escondido na tela e só aparece ao imprimir
 * (ver @media print em index.css).
 */
export default function PrintTicket({ ticket }: { ticket: Ticket }) {
  const p = ticket.print
  return (
    <div className="print-ticket" aria-hidden="true">
      <h2>Burger Lab</h2>
      {p && <p>{new Date(p.at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</p>}
      <p className="pt-label">{ticket.offline ? 'CÓDIGO' : 'SENHA'}</p>
      <p className="pt-number">{ticket.offline ? ticket.clientRef : ticket.number}</p>
      {p && (
        <>
          <p className="pt-mode">{p.mode === 'DINE_IN' ? 'Comer aqui' : 'Para levar'}</p>
          <hr />
          <ul>
            {p.lines.map((l, i) => (
              <li key={i}>
                {l.qty}x {l.name}
                {l.extras.map((e) => (
                  <small key={e}>+ {e}</small>
                ))}
                {l.removed.map((r) => (
                  <small key={r}>sem {r}</small>
                ))}
              </li>
            ))}
          </ul>
          <hr />
          <p className="pt-total">
            Total {brl(p.totalCents)} · {METHOD[p.method]}
          </p>
        </>
      )}
      {ticket.cash && <p className="pt-cash">PAGUE NO CAIXA INFORMANDO ESTA SENHA</p>}
      <p className="pt-foot">Obrigado pela preferência!</p>
    </div>
  )
}
