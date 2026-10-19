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

export type CouponFailure = 'INVALID' | 'EXPIRED' | 'EXHAUSTED' | 'MIN_ORDER'

/** `reason` é o texto em português; `code` deixa o cliente traduzir sem depender do texto. */
export type CouponResult =
  | { ok: true; discountCents: number }
  | { ok: false; reason: string; code: CouponFailure; minOrderCents?: number }

/** Menor total que um pedido com cupom pode ter (evita pedido de R$ 0,00). */
export const MIN_TOTAL_CENTS = 100

/** Regras puras de cupom: sem acesso a banco, fáceis de testar. */
export function evaluateCoupon(coupon: CouponLike | null, subtotalCents: number, now = new Date()): CouponResult {
  if (!coupon || !coupon.active) return { ok: false, reason: 'Cupom inválido', code: 'INVALID' }
  if (coupon.expiresAt && coupon.expiresAt <= now) return { ok: false, reason: 'Cupom expirado', code: 'EXPIRED' }
  if (coupon.maxUses !== null && coupon.usedCount >= coupon.maxUses) return { ok: false, reason: 'Cupom esgotado', code: 'EXHAUSTED' }
  if (subtotalCents < coupon.minOrderCents) {
    return {
      ok: false,
      reason: `Pedido mínimo de ${(coupon.minOrderCents / 100).toFixed(2).replace('.', ',')} para este cupom`,
      code: 'MIN_ORDER',
      minOrderCents: coupon.minOrderCents,
    }
  }

  const raw = coupon.type === 'PERCENT' ? Math.floor((subtotalCents * coupon.value) / 100) : coupon.value
  const discountCents = Math.max(0, Math.min(raw, subtotalCents - MIN_TOTAL_CENTS))
  return { ok: true, discountCents }
}

export const normalizeCode = (code: string) => code.trim().toUpperCase()
