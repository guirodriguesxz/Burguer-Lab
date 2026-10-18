import type { CartItem } from './types'

export const brl = (cents: number) =>
  (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

export const unitPrice = (i: CartItem) =>
  i.product.priceCents + i.extras.reduce((s, e) => s + e.priceCents, 0)

export const lineTotal = (i: CartItem) => unitPrice(i) * i.qty
