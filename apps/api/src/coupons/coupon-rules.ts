import { CouponType } from '@prisma/client'

export interface CouponLike {
  code: string
  type: CouponType
  value: number
  minOrderCents: number
  maxUses: number | null
  usedCount: number
  expiresAt: Date | null
  active: boolean
}

export type CouponResult = { ok: true; discountCents: number } | { ok: false; reason: string }

/** Menor total que um pedido com cupom pode ter (evita pedido de R$ 0,00). */
export const MIN_TOTAL_CENTS = 100

/** Regras puras de cupom: sem acesso a banco, fáceis de testar. */
export function evaluateCoupon(coupon: CouponLike | null, subtotalCents: number, now = new Date()): CouponResult {
  if (!coupon || !coupon.active) return { ok: false, reason: 'Cupom inválido' }
  if (coupon.expiresAt && coupon.expiresAt <= now) return { ok: false, reason: 'Cupom expirado' }
  if (coupon.maxUses !== null && coupon.usedCount >= coupon.maxUses) return { ok: false, reason: 'Cupom esgotado' }
  if (subtotalCents < coupon.minOrderCents) {
    return { ok: false, reason: `Pedido mínimo de ${(coupon.minOrderCents / 100).toFixed(2).replace('.', ',')} para este cupom` }
  }

  const raw = coupon.type === 'PERCENT' ? Math.floor((subtotalCents * coupon.value) / 100) : coupon.value
  const discountCents = Math.max(0, Math.min(raw, subtotalCents - MIN_TOTAL_CENTS))
  return { ok: true, discountCents }
}

export const normalizeCode = (code: string) => code.trim().toUpperCase()
