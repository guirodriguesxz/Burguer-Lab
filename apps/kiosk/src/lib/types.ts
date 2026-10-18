export interface Category {
  id: string
  label: string
  emoji: string
}

export interface Extra {
  id: string
  name: string
  /** Em centavos */
  priceCents: number
}

export interface Product {
  id: string
  name: string
  description: string
  /** Em centavos */
  priceCents: number
  category: string
  emoji: string
  available: boolean
  extras: Extra[]
  removable: string[]
}

export interface CartItem {
  uid: string
  product: Product
  qty: number
  extras: Extra[]
  removed: string[]
}

export type OrderStatus = 'CREATED' | 'PAID' | 'PREPARING' | 'READY' | 'DELIVERED' | 'CANCELED'
export type Mode = 'DINE_IN' | 'TAKEAWAY'
export type PayMethod = 'PIX' | 'CARD'

export interface OrderItem {
  id: string
  productName: string
  qty: number
  unitPriceCents: number
  extras: { id: string; name: string; priceCents: number }[]
  removed: string[]
}

export interface Order {
  id: string
  number: number
  status: OrderStatus
  mode: Mode
  totalCents: number
  discountCents: number
  clientRef: string | null
  createdAt: string
  items: OrderItem[]
  payment: { status: 'PENDING' | 'PAID' | 'EXPIRED'; txid: string | null; pixPayload: string | null; expiresAt: string | null } | null
}

export interface CouponPreview {
  valid: boolean
  reason?: string
  code?: string
  subtotalCents?: number
  discountCents?: number
  totalCents?: number
}

export interface UpsellSuggestion {
  reason: string
  product: { id: string; name: string; emoji: string; priceCents: number }
}

export interface OrderPayload {
  mode: Mode
  method: PayMethod
  couponCode?: string
  clientRef?: string
  items: { productId: string; qty: number; extraIds: string[]; removed: string[] }[]
}
