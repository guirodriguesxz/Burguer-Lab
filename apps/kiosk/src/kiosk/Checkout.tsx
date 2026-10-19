import { useEffect, useRef, useState } from 'react'
import QRCode from 'qrcode'
import {
  ApiError,
  createOrder,
  fetchOrderStatus,
  isNetworkError,
  simulatePixPayment,
  toItems,
  validateCoupon,
} from '../lib/api'
import { brl, lineTotal } from '../lib/format'
import { enqueueOrder, newClientRef } from '../lib/offline'
import type { CartItem, CouponPreview, Mode, Order, PayMethod } from '../lib/types'

export interface Ticket {
  number: number | null
  clientRef: string | null
  offline: boolean
  /** Pedido para pagar no caixa: ainda não foi pago nem vai para a cozinha. */
  cash?: boolean
}

interface Props {
  cart: CartItem[]
  mode: Mode
  online: boolean
  onBack: () => void
  onPaid: (t: Ticket) => void
}

type Phase = 'choose' | 'processing' | 'pix' | 'expired'

const mmss = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

export default function Checkout({ cart, mode, online, onBack, onPaid }: Props) {
  const [method, setMethod] = useState<PayMethod | null>(null)
  const [phase, setPhase] = useState<Phase>('choose')
  const [error, setError] = useState<string | null>(null)

  const [couponInput, setCouponInput] = useState('')
  const [coupon, setCoupon] = useState<CouponPreview | null>(null)
  const [couponError, setCouponError] = useState<string | null>(null)

  const [pixOrder, setPixOrder] = useState<Order | null>(null)
  const [qr, setQr] = useState<string | null>(null)
  const [now, setNow] = useState(Date.now())
  const clientRef = useRef(newClientRef())

  const subtotal = cart.reduce((s, i) => s + lineTotal(i), 0)
  const discount = coupon?.valid ? (coupon.discountCents ?? 0) : 0
  const total = subtotal - discount
  const couponCode = coupon?.valid ? coupon.code : undefined

  const applyCoupon = async () => {
    setCouponError(null)
    try {
      const r = await validateCoupon(couponInput, cart)
      if (r.valid) setCoupon(r)
      else {
        setCoupon(null)
        setCouponError(r.reason ?? 'Cupom inválido')
      }
    } catch {
      setCouponError('Não foi possível validar o cupom agora')
    }
  }

  // Cartão (maquininha simulada): aprova em 2,5s. Sem internet, o pedido entra na fila e sincroniza depois.
  const payCard = async () => {
    setPhase('processing')
    setError(null)
    const key = crypto.randomUUID()
    const wait = new Promise((r) => setTimeout(r, 2500))
    const payload = { mode, method: 'CARD' as const, couponCode, clientRef: clientRef.current, items: toItems(cart) }

    const queueOffline = () => {
      enqueueOrder(payload, key)
      onPaid({ number: null, clientRef: clientRef.current, offline: true })
    }

    if (!online) {
      await wait
      return queueOffline()
    }
    try {
      const [order] = await Promise.all([createOrder(cart, mode, 'CARD', key, couponCode), wait])
      onPaid({ number: order.number, clientRef: null, offline: false })
    } catch (e) {
      if (isNetworkError(e)) return queueOffline()
      setPhase('choose')
      setError(e instanceof Error ? e.message : 'Falha ao finalizar o pedido')
    }
  }

  // Pagamento no caixa: o pedido é registrado agora e o cliente paga ao atendente. Funciona também sem
  // internet (o pedido entra na fila e é enviado depois, como o do cartão).
  const payCash = async () => {
    setPhase('processing')
    setError(null)
    const key = crypto.randomUUID()
    const payload = { mode, method: 'CASH' as const, couponCode, clientRef: clientRef.current, items: toItems(cart) }
    const queueOffline = () => {
      enqueueOrder(payload, key)
      onPaid({ number: null, clientRef: clientRef.current, offline: true, cash: true })
    }
    if (!online) return queueOffline()
    try {
      const order = await createOrder(cart, mode, 'CASH', key, couponCode)
      onPaid({ number: order.number, clientRef: null, offline: false, cash: true })
    } catch (e) {
      if (isNetworkError(e)) return queueOffline()
      setPhase('choose')
      setError(e instanceof Error ? e.message : 'Falha ao finalizar o pedido')
    }
  }

  const payPix = async () => {
    setPhase('processing')
    setError(null)
    try {
      const order = await createOrder(cart, mode, 'PIX', crypto.randomUUID(), couponCode)
      setPixOrder(order)
      setQr(await QRCode.toDataURL(order.payment!.pixPayload!, { margin: 1, width: 360 }))
      setPhase('pix')
    } catch (e) {
      setPhase('choose')
      setError(e instanceof ApiError ? e.message : 'Sem conexão. Tente o cartão ou chame um atendente.')
    }
  }

  // Espera a confirmação do Pix (webhook do provedor) consultando o status do pedido.
  useEffect(() => {
    if (phase !== 'pix' || !pixOrder) return
    const tick = setInterval(() => setNow(Date.now()), 1000)
    const poll = setInterval(async () => {
      try {
        const s = await fetchOrderStatus(pixOrder.id)
        if (s.paymentStatus === 'PAID') onPaid({ number: s.number, clientRef: null, offline: false })
        else if (s.paymentStatus === 'EXPIRED' || s.status === 'CANCELED') setPhase('expired')
      } catch {
        // falha momentânea de rede: tenta de novo no próximo ciclo
      }
    }, 1500)
    return () => {
      clearInterval(tick)
      clearInterval(poll)
    }
  }, [phase, pixOrder, onPaid])

  const expiresAt = pixOrder?.payment?.expiresAt ? new Date(pixOrder.payment.expiresAt).getTime() : 0

  return (
    <main className="checkout">
      <h1>Pagamento</h1>
      <p className="muted">{mode === 'DINE_IN' ? 'Para comer aqui' : 'Para levar'}</p>

      {phase === 'choose' && (
        <>
          <div className="coupon">
            {coupon?.valid ? (
              <p className="coupon-ok">
                ✓ Cupom <strong>{coupon.code}</strong> aplicado: −{brl(discount)}{' '}
                <button className="link" onClick={() => (setCoupon(null), setCouponInput(''))}>remover</button>
              </p>
            ) : (
              <>
                <input
                  aria-label="Cupom de desconto"
                  placeholder="Cupom de desconto"
                  value={couponInput}
                  disabled={!online}
                  onChange={(e) => setCouponInput(e.target.value.toUpperCase())}
                />
                <button className="btn-ghost small" disabled={!online || !couponInput.trim()} onClick={applyCoupon}>
                  Aplicar
                </button>
              </>
            )}
            {couponError && <p role="alert" className="error">{couponError}</p>}
          </div>

          <p className="totals">
            {discount > 0 && <span className="muted">Subtotal {brl(subtotal)} · </span>}
            Total <strong>{brl(total)}</strong>
          </p>

          <div className="pay-options">
            <button className={method === 'PIX' ? 'pay on' : 'pay'} disabled={!online} onClick={() => setMethod('PIX')}>
              <span>⚡</span> Pix
              {!online && <small>Indisponível sem internet</small>}
            </button>
            <button className={method === 'CARD' ? 'pay on' : 'pay'} onClick={() => setMethod('CARD')}>
              <span>💳</span> Cartão
            </button>
            <button className={method === 'CASH' ? 'pay on' : 'pay'} onClick={() => setMethod('CASH')}>
              <span>💵</span> No caixa
            </button>
          </div>

          {method === 'CARD' && (
            <div className="pay-instruction">
              <p className="big-emoji">💳</p>
              <p>Aproxime ou insira o cartão na maquininha.</p>
              {!online && <p className="muted">Sem internet: seu pedido será enviado assim que a conexão voltar.</p>}
            </div>
          )}
          {method === 'CASH' && (
            <div className="pay-instruction">
              <p className="big-emoji">💵</p>
              <p>Você recebe uma senha e paga ao atendente no caixa. O pedido vai para a cozinha depois do pagamento.</p>
            </div>
          )}
          {error && <p role="alert" className="error">{error}</p>}

          <div className="checkout-actions">
            <button className="btn-ghost" onClick={onBack}>Voltar ao cardápio</button>
            <button className="btn-primary" disabled={!method} onClick={method === 'PIX' ? payPix : method === 'CASH' ? payCash : payCard}>
              {method === 'PIX'
                ? 'Gerar QR Code Pix'
                : method === 'CARD'
                  ? 'Simular pagamento no cartão'
                  : method === 'CASH'
                    ? 'Gerar senha e pagar no caixa'
                    : 'Escolha a forma de pagamento'}
            </button>
          </div>
        </>
      )}

      {phase === 'processing' && (
        <div className="pay-instruction" role="status">
          <div className="spinner" />
          <p>Processando…</p>
        </div>
      )}

      {phase === 'pix' && pixOrder && (
        <div className="pay-instruction" role="status">
          {qr && <img className="qr-img" src={qr} alt="QR Code Pix para pagamento" />}
          <p>
            Escaneie com o app do seu banco · <strong>{brl(pixOrder.totalCents)}</strong>
          </p>
          <p className="muted">Expira em {mmss(expiresAt - now)} · aguardando pagamento…</p>
          {import.meta.env.DEV && pixOrder.payment?.txid && (
            <button className="btn-ghost small" onClick={() => simulatePixPayment(pixOrder.payment!.txid!)}>
              [dev] Simular pagamento no app do banco
            </button>
          )}
          <button className="btn-ghost" onClick={onBack}>Cancelar</button>
        </div>
      )}

      {phase === 'expired' && (
        <div className="pay-instruction" role="alert">
          <p className="big-emoji">⏰</p>
          <p>O QR Code expirou e o pedido foi cancelado.</p>
          <div className="checkout-actions">
            <button className="btn-ghost" onClick={onBack}>Voltar ao cardápio</button>
            <button className="btn-primary" onClick={() => (setPhase('choose'), setPixOrder(null), setQr(null))}>Tentar de novo</button>
          </div>
        </div>
      )}
    </main>
  )
}
