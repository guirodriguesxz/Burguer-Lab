export interface Category {
  id: string
  label: string
  labelEn?: string | null
  emoji: string
}

export interface Extra {
  id: string
  name: string
  nameEn?: string | null
  /** Em centavos */
  priceCents: number
}

export interface Product {
  id: string
  name: string
  nameEn?: string | null
  description: string
  descriptionEn?: string | null
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
export type PayMethod = 'PIX' | 'CARD' | 'CASH'

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
  /** Senha do dia (recomeça em 1 todo dia); é a que o cliente vê. */
  ticket: number
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
  /** Válido: o código do cupom. Inválido: INVALID | EXPIRED | EXHAUSTED | MIN_ORDER. */
  code?: string
  minOrderCents?: number
  subtotalCents?: number
  discountCents?: number
  totalCents?: number
}

export interface UpsellSuggestion {
  kind: string
  reason: string
  product: { id: string; name: string; nameEn?: string | null; emoji: string; priceCents: number }
}

export interface OrderPayload {
  mode: Mode
  method: PayMethod
  couponCode?: string
  clientRef?: string
  items: { productId: string; qty: number; extraIds: string[]; removed: string[] }[]
}
