export type Role = 'ADMIN' | 'KITCHEN' | 'CASHIER'
/** Sessão: só os dados do usuário. O token fica num cookie HttpOnly que o JavaScript não enxerga. */
export interface Session {
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

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

/** Disparado quando o servidor responde 401 numa chamada com sessão (expirou, foi revogada ou o usuário foi desativado). */
export const unauthorizedEvent = 'burgerlab:unauthorized'

/**
 * Todas as chamadas vão com o cookie de sessão (mesma origem) e com X-Requested-With, que o servidor exige em
 * requisições que alteram dados: outro site não consegue enviar esse cabeçalho (proteção contra CSRF).
 */
async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...init,
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
  })
  if (!res.ok) {
    // 401 no login/redefinição é "senha errada", não "sessão caiu"
    if (res.status === 401 && !path.startsWith('/auth/login')) window.dispatchEvent(new Event(unauthorizedEvent))
    const body = await res.json().catch(() => null)
    throw new ApiError(res.status, typeof body?.message === 'string' ? body.message : 'Erro ao falar com o servidor')
  }
  return res.json()
}

export const login = (email: string, password: string) =>
  request<Session>('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) })

/** Quem está logado (pelo cookie). Usado ao abrir a página, já que nada é guardado no navegador. */
export const fetchMe = () => request<Session['user']>('/auth/me')

export const logout = () => request<{ ok: boolean }>('/auth/logout', { method: 'POST' })

export const forgotPassword = (email: string) =>
  request<{ ok: boolean; message: string }>('/auth/forgot-password', { method: 'POST', body: JSON.stringify({ email }) })

export const resetPassword = (token: string, password: string) =>
  request<{ ok: boolean }>('/auth/reset-password', { method: 'POST', body: JSON.stringify({ token, password }) })

// Pedidos entregues saem da tela da cozinha, então nem são buscados.
export const fetchOrders = () => request<Order[]>('/orders?status=PAID,PREPARING,READY')

export const fetchPendingCash = () => request<Order[]>('/orders?status=CREATED')

export const confirmCash = (id: string) =>
  request<Order>(`/orders/${id}/confirm-cash`, { method: 'POST' })

export const updateOrderStatus = (id: string, status: OrderStatus) =>
  request<Order>(`/orders/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) })

export const fetchCoupons = () => request<Coupon[]>('/admin/coupons')

export const createCoupon = (data: NewCoupon) =>
  request<Coupon>('/admin/coupons', { method: 'POST', body: JSON.stringify(data) })

export const patchCoupon = (id: string, data: Partial<Pick<Coupon, 'active' | 'maxUses'>>) =>
  request<Coupon>(`/admin/coupons/${id}`, { method: 'PATCH', body: JSON.stringify(data) })

export const fetchSummary =(days: number) =>
  request<Summary>(`/admin/reports/summary?days=${days}`)

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

export const fetchUsers = () => request<AdminUser[]>('/admin/users')

export const createUser = (data: { name: string; email: string; role: Role; password: string }) =>
  request<AdminUser>('/admin/users', { method: 'POST', body: JSON.stringify(data) })

export const updateUser = (id: string, data: Partial<Pick<AdminUser, 'name' | 'role' | 'active'>>) =>
  request<AdminUser>(`/admin/users/${id}`, { method: 'PATCH', body: JSON.stringify(data) })

export const sendUserReset = (id: string) =>
  request<{ ok: boolean }>(`/admin/users/${id}/send-reset`, { method: 'POST' })

export const changePassword = (currentPassword: string, newPassword: string) =>
  request<{ ok: boolean }>('/auth/change-password', { method: 'POST', body: JSON.stringify({ currentPassword, newPassword }) })

export const fetchHistory = (f: HistoryFilters) => request<HistoryPage>(`/admin/orders${toQuery(f)}`)

export const refundOrder = (id: string) => request<Order>(`/admin/orders/${id}/refund`, { method: 'POST' })

/** Baixa o CSV como arquivo (a sessão vai no cookie). */
export async function downloadHistoryCsv(f: HistoryFilters) {
  const { page: _p, pageSize: _s, ...filters } = f
  const res = await fetch(`/api/admin/orders/export.csv${toQuery(filters)}`, { credentials: 'same-origin' })
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
  nameEn?: string | null
  descriptionEn?: string | null
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

export type ProductInput = Pick<AdminProduct, 'name' | 'description' | 'nameEn' | 'descriptionEn' | 'emoji' | 'categoryId' | 'priceCents' | 'stock' | 'removable' | 'available'>

export const fetchProducts = (archived = false) =>
  request<AdminProduct[]>(`/admin/products${archived ? '?archived=true' : ''}`)

export const createProduct = (data: ProductInput) =>
  request<AdminProduct>('/admin/products', { method: 'POST', body: JSON.stringify(data) })

export const patchProduct = (id: string, data: Partial<ProductInput>) =>
  request<AdminProduct>(`/admin/products/${id}`, { method: 'PATCH', body: JSON.stringify(data) })

export const archiveProduct = (id: string) => request<AdminProduct>(`/admin/products/${id}`, { method: 'DELETE' })

export const restoreProduct = (id: string) => request<AdminProduct>(`/admin/products/${id}/restore`, { method: 'POST' })

export const createExtra = (productId: string, data: Omit<AdminExtra, 'id'>) =>
  request<AdminExtra>(`/admin/products/${productId}/extras`, { method: 'POST', body: JSON.stringify(data) })

export const patchExtra = (id: string, data: Partial<Omit<AdminExtra, 'id'>>) =>
  request<AdminExtra>(`/admin/extras/${id}`, { method: 'PATCH', body: JSON.stringify(data) })

export const deleteExtra = (id: string) => request<{ ok: boolean }>(`/admin/extras/${id}`, { method: 'DELETE' })

export const fetchCategories = () => request<AdminCategory[]>('/admin/categories')

export const createCategory = (data: { label: string; emoji: string }) =>
  request<AdminCategory>('/admin/categories', { method: 'POST', body: JSON.stringify(data) })

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

// ---------- Auditoria ----------

export interface AuditFilters {
  from?: string
  to?: string
  action?: string
  actor?: string
  page?: number
}

export interface AuditPage {
  items: { id: string; at: string; actorEmail: string | null; action: string; entity: string | null; entityId: string | null; meta: unknown; ip: string | null }[]
  total: number
  page: number
  pageSize: number
}

export const fetchAudit = (f: AuditFilters) => request<AuditPage>(`/admin/audit${toQuery(f)}`)

export interface DemoInfo {
  demo: boolean
  logins: { label: string; email: string; password: string }[]
}
export const fetchDemo = () => request<DemoInfo>('/demo')
