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
import { friendlyError, pick, useI18n } from '../lib/i18n'
import { enqueueOrder, newClientRef } from '../lib/offline'
import type { CartItem, CouponPreview, Mode, Order, PayMethod } from '../lib/types'

/** O que vai no comprovante impresso. */
export interface PrintInfo {
  lines: { qty: number; name: string; extras: string[]; removed: string[] }[]
  totalCents: number
  method: PayMethod
  mode: Mode
  at: number
}

export interface Ticket {
  number: number | null
  clientRef: string | null
  offline: boolean
  /** Pedido para pagar no caixa: ainda não foi pago nem vai para a cozinha. */
  cash?: boolean
  print?: PrintInfo
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
  const { t, lang } = useI18n()
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

  const finish = (method: PayMethod, t: Omit<Ticket, 'print'>) =>
    onPaid({
      ...t,
      print: {
        lines: cart.map((i) => ({ qty: i.qty, name: pick(lang, i.product.name, i.product.nameEn), extras: i.extras.map((e) => pick(lang, e.name, e.nameEn)), removed: i.removed })),
        totalCents: total,
        method,
        mode,
        at: Date.now(),
      },
    })

  const applyCoupon = async () => {
    setCouponError(null)
    try {
      const r = await validateCoupon(couponInput, cart)
      if (r.valid) setCoupon(r)
      else {
        setCoupon(null)
        const key = r.code === 'EXPIRED' ? 'pay.couponExpired' : r.code === 'EXHAUSTED' ? 'pay.couponExhausted' : r.code === 'MIN_ORDER' ? 'pay.couponMin' : 'pay.couponInvalid'
        setCouponError(t(key, { min: brl(r.minOrderCents ?? 0) }))
      }
    } catch {
      setCouponError(t('pay.couponError'))
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
      finish('CARD', { number: null, clientRef: clientRef.current, offline: true })
    }

    if (!online) {
      await wait
      return queueOffline()
    }
    try {
      const [order] = await Promise.all([createOrder(cart, mode, 'CARD', key, couponCode), wait])
      finish('CARD', { number: order.ticket, clientRef: null, offline: false })
    } catch (e) {
      if (isNetworkError(e)) return queueOffline()
      setPhase('choose')
      setError(friendlyError(e, lang, t, t('pay.failed')))
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
      finish('CASH', { number: null, clientRef: clientRef.current, offline: true, cash: true })
    }
    if (!online) return queueOffline()
    try {
      const order = await createOrder(cart, mode, 'CASH', key, couponCode)
      finish('CASH', { number: order.ticket, clientRef: null, offline: false, cash: true })
    } catch (e) {
      if (isNetworkError(e)) return queueOffline()
      setPhase('choose')
      setError(friendlyError(e, lang, t, t('pay.failed')))
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
      setError(e instanceof ApiError ? friendlyError(e, lang, t, t('pay.noConnectionPix')) : t('pay.noConnectionPix'))
    }
  }

  // Espera a confirmação do Pix (webhook do provedor) consultando o status do pedido.
  useEffect(() => {
    if (phase !== 'pix' || !pixOrder) return
    const tick = setInterval(() => setNow(Date.now()), 1000)
    const poll = setInterval(async () => {
      try {
        const s = await fetchOrderStatus(pixOrder.id)
        if (s.paymentStatus === 'PAID') finish('PIX', { number: s.ticket, clientRef: null, offline: false })
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
      <h1>{t('pay.title')}</h1>
      <p className="muted">{mode === 'DINE_IN' ? t('pay.dineIn') : t('pay.takeaway')}</p>

      {phase === 'choose' && (
        <>
          <div className="coupon">
            {coupon?.valid ? (
              <p className="coupon-ok">
                ✓ {t('pay.couponApplied', { code: coupon.code ?? '', amount: brl(discount) })}{' '}
                <button className="link" onClick={() => (setCoupon(null), setCouponInput(''))}>{t('pay.remove')}</button>
              </p>
            ) : (
              <>
                <input
                  aria-label={t('pay.couponLabel')}
                  placeholder={t('pay.couponLabel')}
                  value={couponInput}
                  disabled={!online}
                  onChange={(e) => setCouponInput(e.target.value.toUpperCase())}
                />
                <button className="btn-ghost small" disabled={!online || !couponInput.trim()} onClick={applyCoupon}>
                  {t('pay.apply')}
                </button>
              </>
            )}
            {couponError && <p role="alert" className="error">{couponError}</p>}
          </div>

          <p className="totals">
            {discount > 0 && <span className="muted">{t('pay.subtotal', { x: brl(subtotal) })} · </span>}
            {t('pay.totalLabel')} <strong>{brl(total)}</strong>
          </p>

          <div className="pay-options">
            <button className={method === 'PIX' ? 'pay on' : 'pay'} disabled={!online} onClick={() => setMethod('PIX')}>
              <span>⚡</span> {t('pay.pix')}
              {!online && <small>{t('pay.offline')}</small>}
            </button>
            <button className={method === 'CARD' ? 'pay on' : 'pay'} onClick={() => setMethod('CARD')}>
              <span>💳</span> {t('pay.card')}
            </button>
            <button className={method === 'CASH' ? 'pay on' : 'pay'} onClick={() => setMethod('CASH')}>
              <span>💵</span> {t('pay.cash')}
            </button>
          </div>

          {method === 'CARD' && (
            <div className="pay-instruction">
              <p className="big-emoji">💳</p>
              <p>{t('pay.cardHint')}</p>
              {!online && <p className="muted">{t('pay.cardOffline')}</p>}
            </div>
          )}
          {method === 'CASH' && (
            <div className="pay-instruction">
              <p className="big-emoji">💵</p>
              <p>{t('pay.cashHint')}</p>
            </div>
          )}
          {error && <p role="alert" className="error">{error}</p>}

          <div className="checkout-actions">
            <button className="btn-ghost" onClick={onBack}>{t('pay.back')}</button>
            <button className="btn-primary" disabled={!method} onClick={method === 'PIX' ? payPix : method === 'CASH' ? payCash : payCard}>
              {method === 'PIX'
                ? t('pay.btn.pix')
                : method === 'CARD'
                  ? t('pay.btn.card')
                  : method === 'CASH'
                    ? t('pay.btn.cash')
                    : t('pay.btn.choose')}
            </button>
          </div>
        </>
      )}

      {phase === 'processing' && (
        <div className="pay-instruction" role="status">
          <div className="spinner" />
          <p>{t('pay.processing')}</p>
        </div>
      )}

      {phase === 'pix' && pixOrder && (
        <div className="pay-instruction" role="status">
          {qr && <img className="qr-img" src={qr} alt={t('pay.pixQrAlt')} />}
          <p>{t('pay.pixScan', { amount: brl(pixOrder.totalCents) })}</p>
          <p className="muted">{t('pay.pixExpires', { time: mmss(expiresAt - now) })}</p>
          {import.meta.env.DEV && pixOrder.payment?.txid && (
            <button className="btn-ghost small" onClick={() => simulatePixPayment(pixOrder.payment!.txid!)}>
              [dev] Simular pagamento no app do banco
            </button>
          )}
          <button className="btn-ghost" onClick={onBack}>{t('pay.cancel')}</button>
        </div>
      )}

      {phase === 'expired' && (
        <div className="pay-instruction" role="alert">
          <p className="big-emoji">⏰</p>
          <p>{t('pay.expired')}</p>
          <div className="checkout-actions">
            <button className="btn-ghost" onClick={onBack}>{t('pay.back')}</button>
            <button className="btn-primary" onClick={() => (setPhase('choose'), setPixOrder(null), setQr(null))}>{t('pay.tryAgain')}</button>
          </div>
        </div>
      )}
    </main>
  )
}
