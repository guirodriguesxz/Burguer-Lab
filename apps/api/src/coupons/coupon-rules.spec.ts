import { CouponLike, evaluateCoupon } from './coupon-rules'

const base: CouponLike = {
  code: 'X',
  type: 'PERCENT',
  value: 10,
  minOrderCents: 0,
  maxUses: null,
  usedCount: 0,
  expiresAt: null,
  active: true,
}

describe('evaluateCoupon', () => {
  it('aplica percentual com arredondamento para baixo', () => {
    expect(evaluateCoupon(base, 2490)).toEqual({ ok: true, discountCents: 249 })
    expect(evaluateCoupon({ ...base, value: 15 }, 1999)).toEqual({ ok: true, discountCents: 299 })
  })

  it('aplica valor fixo, limitado ao subtotal menos o total mínimo', () => {
    expect(evaluateCoupon({ ...base, type: 'FIXED', value: 500 }, 3000)).toEqual({ ok: true, discountCents: 500 })
    expect(evaluateCoupon({ ...base, type: 'FIXED', value: 5000 }, 3000)).toEqual({ ok: true, discountCents: 2900 })
  })

  it('rejeita cupom inexistente, inativo, expirado ou esgotado', () => {
    expect(evaluateCoupon(null, 1000).ok).toBe(false)
    expect(evaluateCoupon({ ...base, active: false }, 1000).ok).toBe(false)
    expect(evaluateCoupon({ ...base, expiresAt: new Date('2020-01-01') }, 1000)).toEqual({ ok: false, reason: 'Cupom expirado' })
    expect(evaluateCoupon({ ...base, maxUses: 5, usedCount: 5 }, 1000)).toEqual({ ok: false, reason: 'Cupom esgotado' })
  })

  it('exige pedido mínimo', () => {
    const r = evaluateCoupon({ ...base, minOrderCents: 3000 }, 2000)
    expect(r.ok).toBe(false)
  })
})
