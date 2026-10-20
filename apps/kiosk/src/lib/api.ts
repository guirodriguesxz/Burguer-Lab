import type {
  CartItem,
  Category,
  CouponPreview,
  Mode,
  Order,
  OrderPayload,
  PayMethod,
  Product,
  UpsellSuggestion,
} from './types'

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  })
  if (!res.ok) {
    const body = await res.json().catch(() => null)
    throw new ApiError(res.status, typeof body?.message === 'string' ? body.message : 'Erro ao falar com o servidor')
  }
  return res.json()
}

/** Erro de rede (sem resposta do servidor), diferente de uma recusa do servidor (ApiError). */
export const isNetworkError = (e: unknown) => !(e instanceof ApiError)

export const fetchMenu = () => request<{ categories: Category[]; products: Product[] }>('/menu')

export const fetchUpsell = (productIds: string[]) =>
  request<UpsellSuggestion[]>(`/menu/upsell?productIds=${encodeURIComponent(productIds.join(','))}`)

export const toItems = (cart: CartItem[]): OrderPayload['items'] =>
  cart.map((i) => ({ productId: i.product.id, qty: i.qty, extraIds: i.extras.map((e) => e.id), removed: i.removed }))

export const validateCoupon = (code: string, cart: CartItem[]) =>
  request<CouponPreview>('/coupons/validate', { method: 'POST', body: JSON.stringify({ code, items: toItems(cart) }) })

/** A chave de idempotência evita pedido duplicado se o cliente repetir a requisição. */
export const sendOrder = (payload: OrderPayload, idempotencyKey: string) =>
  request<Order>('/orders', { method: 'POST', headers: { 'Idempotency-Key': idempotencyKey }, body: JSON.stringify(payload) })

export const createOrder = (cart: CartItem[], mode: Mode, method: PayMethod, idempotencyKey: string, couponCode?: string) =>
  sendOrder({ mode, method, couponCode, items: toItems(cart) }, idempotencyKey)

export const fetchOrderStatus = (id: string) =>
  request<{
    id: string
    number: number
    ticket: number
    status: Order['status']
    paymentStatus: 'PENDING' | 'PAID' | 'EXPIRED' | 'REFUNDED' | 'REFUND_FAILED' | null
  }>(
    `/orders/${id}/status`,
  )

export const fetchQueue = () => request<{ preparing: number[]; ready: number[] }>('/queue')

/** Só desenvolvimento: faz o papel do banco/PSP confirmando o Pix via webhook assinado. */
export const simulatePixPayment = (txid: string) => request<{ ok: boolean }>(`/dev/pix/${txid}/pay`, { method: 'POST' })

/** Modo demonstração: libera o botão que faz o papel do banco no Pix de teste. */
export const fetchDemo = () => request<{ demo: boolean }>('/demo')
