export type Role = 'ADMIN' | 'KITCHEN' | 'CASHIER'
export interface Session {
  token: string
  user: { id: string; name: string; email: string; role: Role }
}

export type OrderStatus = 'CREATED' | 'PAID' | 'PREPARING' | 'READY' | 'DELIVERED' | 'CANCELED'

export interface Order {
  id: string
  number: number
  /** Senha do dia (recomeça em 1 todo dia). */
  ticket: number
  status: OrderStatus
  mode: 'DINE_IN' | 'TAKEAWAY'
  totalCents: number
  discountCents: number
  couponCode: string | null
  /** Presente em pedidos feitos offline no totem; identifica o pedido no balcão. */
  clientRef: string | null
  createdAt: string
  payment: {
    method: 'PIX' | 'CARD' | 'CASH'
    status: 'PENDING' | 'PAID' | 'EXPIRED' | 'REFUNDED' | 'REFUND_FAILED'
    expiresAt: string | null
  } | null
  items: {
    id: string
    productName: string
    qty: number
    extras: { id: string; name: string }[]
    removed: string[]
  }[]
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

export const fetchPendingCash = (token: string) => request<Order[]>('/orders?status=CREATED', {}, token)

export const confirmCash = (token: string, id: string) =>
  request<Order>(`/orders/${id}/confirm-cash`, { method: 'POST' }, token)

export const updateOrderStatus = (token: string, id: string, status: OrderStatus) =>
  request<Order>(`/orders/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }, token)

export const fetchCoupons = (token: string) => request<Coupon[]>('/admin/coupons', {}, token)

export const createCoupon = (token: string, data: NewCoupon) =>
  request<Coupon>('/admin/coupons', { method: 'POST', body: JSON.stringify(data) }, token)

export const patchCoupon = (token: string, id: string, data: Partial<Pick<Coupon, 'active' | 'maxUses'>>) =>
  request<Coupon>(`/admin/coupons/${id}`, { method: 'PATCH', body: JSON.stringify(data) }, token)

export const fetchSummary =(token: string, days: number) =>
  request<Summary>(`/admin/reports/summary?days=${days}`, {}, token)

export const brl = (cents: number) => (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

// ---------- Usuários, conta e histórico ----------

export interface AdminUser {
  id: string
  name: string
  email: string
  role: Role
  active: boolean
  createdAt: string
}

export interface HistoryFilters {
  from?: string
  to?: string
  status?: string
  method?: string
  refund?: string
  q?: string
  page?: number
  pageSize?: number
}

export interface HistoryPage {
  items: (Order & { discountCents: number; couponCode: string | null })[]
  total: number
  page: number
  pageSize: number
}

const toQuery = (f: HistoryFilters) => {
  const p = new URLSearchParams()
  for (const [k, v] of Object.entries(f)) if (v !== undefined && v !== '') p.set(k, String(v))
  const s = p.toString()
  return s ? `?${s}` : ''
}

export const fetchUsers = (token: string) => request<AdminUser[]>('/admin/users', {}, token)

export const createUser = (token: string, data: { name: string; email: string; role: Role; password: string }) =>
  request<AdminUser>('/admin/users', { method: 'POST', body: JSON.stringify(data) }, token)

export const updateUser = (token: string, id: string, data: Partial<Pick<AdminUser, 'name' | 'role' | 'active'>>) =>
  request<AdminUser>(`/admin/users/${id}`, { method: 'PATCH', body: JSON.stringify(data) }, token)

export const sendUserReset = (token: string, id: string) =>
  request<{ ok: boolean }>(`/admin/users/${id}/send-reset`, { method: 'POST' }, token)

export const changePassword = (token: string, currentPassword: string, newPassword: string) =>
  request<{ token: string }>('/auth/change-password', { method: 'POST', body: JSON.stringify({ currentPassword, newPassword }) }, token)

export const fetchHistory = (token: string, f: HistoryFilters) => request<HistoryPage>(`/admin/orders${toQuery(f)}`, {}, token)

export const refundOrder = (token: string, id: string) => request<Order>(`/admin/orders/${id}/refund`, { method: 'POST' }, token)

/** Baixa o CSV (precisa do token, então não dá para ser um link simples). */
export async function downloadHistoryCsv(token: string, f: HistoryFilters) {
  const { page: _p, pageSize: _s, ...filters } = f
  const res = await fetch(`/api/admin/orders/export.csv${toQuery(filters)}`, { headers: { Authorization: `Bearer ${token}` } })
  if (!res.ok) throw new ApiError(res.status, 'Não foi possível gerar o arquivo')
  const url = URL.createObjectURL(await res.blob())
  const a = document.createElement('a')
  a.href = url
  a.download = 'pedidos.csv'
  a.click()
  URL.revokeObjectURL(url)
}

// ---------- Cardápio (produtos, adicionais, categorias) ----------

export interface AdminExtra {
  id: string
  name: string
  priceCents: number
}

export interface AdminProduct {
  id: string
  name: string
  description: string
  emoji: string
  categoryId: string
  priceCents: number
  available: boolean
  archived: boolean
  /** null = estoque ilimitado */
  stock: number | null
  removable: string[]
  extras: AdminExtra[]
}

export interface AdminCategory {
  id: string
  label: string
  emoji: string
}

export type ProductInput = Pick<AdminProduct, 'name' | 'description' | 'emoji' | 'categoryId' | 'priceCents' | 'stock' | 'removable' | 'available'>

export const fetchProducts = (token: string, archived = false) =>
  request<AdminProduct[]>(`/admin/products${archived ? '?archived=true' : ''}`, {}, token)

export const createProduct = (token: string, data: ProductInput) =>
  request<AdminProduct>('/admin/products', { method: 'POST', body: JSON.stringify(data) }, token)

export const patchProduct = (token: string, id: string, data: Partial<ProductInput>) =>
  request<AdminProduct>(`/admin/products/${id}`, { method: 'PATCH', body: JSON.stringify(data) }, token)

export const archiveProduct = (token: string, id: string) => request<AdminProduct>(`/admin/products/${id}`, { method: 'DELETE' }, token)

export const restoreProduct = (token: string, id: string) => request<AdminProduct>(`/admin/products/${id}/restore`, { method: 'POST' }, token)

export const createExtra = (token: string, productId: string, data: Omit<AdminExtra, 'id'>) =>
  request<AdminExtra>(`/admin/products/${productId}/extras`, { method: 'POST', body: JSON.stringify(data) }, token)

export const patchExtra = (token: string, id: string, data: Partial<Omit<AdminExtra, 'id'>>) =>
  request<AdminExtra>(`/admin/extras/${id}`, { method: 'PATCH', body: JSON.stringify(data) }, token)

export const deleteExtra = (token: string, id: string) => request<{ ok: boolean }>(`/admin/extras/${id}`, { method: 'DELETE' }, token)

export const fetchCategories = (token: string) => request<AdminCategory[]>('/admin/categories', {}, token)

export const createCategory = (token: string, data: { label: string; emoji: string }) =>
  request<AdminCategory>('/admin/categories', { method: 'POST', body: JSON.stringify(data) }, token)

/** "24,90" ou "24.90" em centavos; NaN se não for um valor. */
export const parseMoney = (text: string) => Math.round(parseFloat(text.replace(',', '.')) * 100)

// ---------- Cupons ----------

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
