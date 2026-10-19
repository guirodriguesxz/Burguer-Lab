import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { brl, type Order } from '../lib/api'

/** Pede para imprimir a comanda de um pedido: renderiza a comanda e abre a impressão do navegador. */
export function usePrint() {
  const [printing, setPrinting] = useState<Order | null>(null)

  useEffect(() => {
    if (!printing) return
    const done = () => setPrinting(null)
    window.addEventListener('afterprint', done, { once: true })
    // espera a comanda ser pintada antes de abrir o diálogo
    const t = setTimeout(() => window.print(), 50)
    return () => {
      clearTimeout(t)
      window.removeEventListener('afterprint', done)
    }
  }, [printing])

  return { printing, print: setPrinting }
}

/**
 * Comanda para impressora térmica de 80 mm. Renderizada fora do #root e visível só na impressão
 * (ver @media print em styles.css).
 */
export default function Comanda({ order }: { order: Order | null }) {
  if (!order) return null
  return createPortal(
    <div className="print-area" aria-hidden="true">
      <h2>COMANDA #{order.ticket}</h2>
      {order.clientRef && <p>código {order.clientRef}</p>}
      <p>
        {order.mode === 'DINE_IN' ? 'COMER AQUI' : 'PARA VIAGEM'} ·{' '}
        {new Date(order.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
      </p>
      <hr />
      <ul>
        {order.items.map((i) => (
          <li key={i.id}>
            <strong>
              {i.qty}x {i.productName}
            </strong>
            {i.extras.map((e) => (
              <small key={e.id}>+ {e.name}</small>
            ))}
            {i.removed.map((r) => (
              <small key={r}>SEM {r}</small>
            ))}
          </li>
        ))}
      </ul>
      <hr />
      <p>Total {brl(order.totalCents)}</p>
    </div>,
    document.body,
  )
}
