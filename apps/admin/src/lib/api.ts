export type Role = 'ADMIN' | 'KITCHEN'
export interface Session {
  token: string
  user: { id: string; name: string; email: string; role: Role }
}

export type OrderStatus = 'CREATED' | 'PAID' | 'PREPARING' | 'READY' | 'DELIVERED' | 'CANCELED'

export interface Order {
  id: string
  number: number
  status: OrderStatus
  mode: 'DINE_IN' | 'TAKEAWAY'
  totalCents: number
  discountCents: number
  couponCode: string | null
  /** Presente em pedidos feitos offline no totem; identifica o pedido no balcão. */
  clientRef: string | null
  createdAt: string
  items: {
    id: string
    productName: string
    qty: number
    extras: { id: string; name: string }[]
    removed: string[]
  }[]
}

export interface AdminProduct {
  id: string
  name: string
  categoryId: string
  emoji: string
  priceCents: number
  available: boolean
  stock: number | null
}

export interface Coupon {
  id: string
  code: string
  type: 'PERCENT' | 'FIXED'
  value: number
  minOrderCents: number
  maxUses: number | null
  usedCount: number
  expiresAt: string | null
  active: boolean
}

export interface NewCoupon {
  code: string
  type: 'PERCENT' | 'FIXED'
  value: number
  minOrderCents: number
  maxUses: number | null
  expiresAt: string | null
}

export interface Summary {
  days: number
  orders: number
  revenueCents: number
  avgTicketCents: number
  byHour: { hour: number; orders: number; revenueCents: number }[]
  byDay: { day: string; orders: number; revenueCents: number }[]
  topProducts: { name: string; qty: number; revenueCents: number }[]
}

const KEY = 'burgerlab:session'

export function loadSession(): Session | null {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? 'null')
  } catch {
    return null
  }
}

export function saveSession(s: Session | null) {
  try {
    if (s) localStorage.setItem(KEY, JSON.stringify(s))
    else localStorage.removeItem(KEY)
  } catch {
    // armazenamento indisponível: a sessão vale só até recarregar a página
  }
}

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

/** Disparado quando o servidor responde 401 em uma chamada autenticada (token expirado). */
export const unauthorizedEvent = 'burgerlab:unauthorized'

async function request<T>(path: string, init: RequestInit = {}, token?: string): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  })
  if (!res.ok) {
    if (res.status === 401 && token) window.dispatchEvent(new Event(unauthorizedEvent))
    const body = await res.json().catch(() => null)
    throw new ApiError(res.status, typeof body?.message === 'string' ? body.message : 'Erro ao falar com o servidor')
  }
  return res.json()
}

export const login = (email: string, password: string) =>
  request<Session>('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) })

export const forgotPassword = (email: string) =>
  request<{ ok: boolean; message: string }>('/auth/forgot-password', { method: 'POST', body: JSON.stringify({ email }) })

export const resetPassword = (token: string, password: string) =>
  request<{ ok: boolean }>('/auth/reset-password', { method: 'POST', body: JSON.stringify({ token, password }) })

// Pedidos entregues saem da tela da cozinha, então nem são buscados.
export const fetchOrders = (token: string) => request<Order[]>('/orders?status=PAID,PREPARING,READY', {}, token)

export const updateOrderStatus = (token: string, id: string, status: OrderStatus) =>
  request<Order>(`/orders/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }, token)

export const fetchProducts = (token: string) => request<AdminProduct[]>('/admin/products', {}, token)

export const patchProduct = (
  token: string,
  id: string,
  data: Partial<Pick<AdminProduct, 'priceCents' | 'available' | 'stock'>>,
) => request<AdminProduct>(`/admin/products/${id}`, { method: 'PATCH', body: JSON.stringify(data) }, token)

export const fetchCoupons = (token: string) => request<Coupon[]>('/admin/coupons', {}, token)

export const createCoupon = (token: string, data: NewCoupon) =>
  request<Coupon>('/admin/coupons', { method: 'POST', body: JSON.stringify(data) }, token)

export const patchCoupon = (token: string, id: string, data: Partial<Pick<Coupon, 'active' | 'maxUses'>>) =>
  request<Coupon>(`/admin/coupons/${id}`, { method: 'PATCH', body: JSON.stringify(data) }, token)

export const fetchSummary =(token: string, days: number) =>
  request<Summary>(`/admin/reports/summary?days=${days}`, {}, token)

export const brl = (cents: number) => (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
