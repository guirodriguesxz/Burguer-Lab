import { useState } from 'react'
import { brl, lineTotal } from '../lib/format'
import { createOrder } from '../lib/api'
import type { CartItem, Mode, Order, PayMethod } from '../lib/types'

interface Props {
  cart: CartItem[]
  mode: Mode
  onBack: () => void
  onPaid: (o: Order) => void
}

export default function Checkout({ cart, mode, onBack, onPaid }: Props) {
  const [method, setMethod] = useState<PayMethod | null>(null)
  const [paying, setPaying] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Mesma chave em retentativas: o servidor devolve o pedido já criado em vez de duplicar.
  const [key] = useState(() => crypto.randomUUID())
  const total = cart.reduce((s, i) => s + lineTotal(i), 0)

  // Pagamento simulado: aprova após 2,5s e então cria o pedido na API (preço recalculado no servidor).
  const pay = async () => {
    if (!method) return
    setPaying(true)
    setError(null)
    try {
      const [order] = await Promise.all([
        createOrder(cart, mode, method, key),
        new Promise((r) => setTimeout(r, 2500)),
      ])
      onPaid(order)
    } catch (e) {
      setPaying(false)
      setError(e instanceof Error ? e.message : 'Falha ao finalizar o pedido')
    }
  }

  return (
    <main className="checkout">
      <h1>Pagamento</h1>
      <p className="muted">
        {mode === 'DINE_IN' ? 'Para comer aqui' : 'Para levar'} · Total <strong>{brl(total)}</strong>
      </p>

      {!paying ? (
        <>
          <div className="pay-options">
            <button className={method === 'PIX' ? 'pay on' : 'pay'} onClick={() => setMethod('PIX')}>
              <span>⚡</span> Pix
            </button>
            <button className={method === 'CARD' ? 'pay on' : 'pay'} onClick={() => setMethod('CARD')}>
              <span>💳</span> Cartão
            </button>
          </div>

          {error && <p role="alert" className="error">{error}</p>}
          {method === 'PIX' && (
            <div className="pay-instruction">
              <div className="qr" aria-hidden="true" />
              <p>Escaneie o QR Code com o app do seu banco.</p>
            </div>
          )}
          {method === 'CARD' && (
            <div className="pay-instruction">
              <p className="big-emoji">💳</p>
              <p>Aproxime ou insira o cartão na maquininha.</p>
            </div>
          )}

          <div className="checkout-actions">
            <button className="btn-ghost" onClick={onBack}>Voltar ao cardápio</button>
            <button className="btn-primary" disabled={!method} onClick={pay}>
              {method ? 'Simular pagamento' : 'Escolha a forma de pagamento'}
            </button>
          </div>
        </>
      ) : (
        <div className="pay-instruction" role="status">
          <div className="spinner" />
          <p>Processando pagamento…</p>
        </div>
      )}
    </main>
  )
}
