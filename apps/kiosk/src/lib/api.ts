import type { CartItem, Category, Mode, Order, OrderStatus, PayMethod, Product } from './types'

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

export const fetchMenu = () => request<{ categories: Category[]; products: Product[] }>('/menu')

export const fetchOrders = (status?: OrderStatus[]) =>
  request<Order[]>(`/orders${status ? `?status=${status.join(',')}` : ''}`)

export const updateOrderStatus = (id: string, status: OrderStatus) =>
  request<Order>(`/orders/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) })

/** A chave de idempotência evita pedido duplicado se o cliente repetir a requisição. */
export const createOrder = (cart: CartItem[], mode: Mode, method: PayMethod, idempotencyKey: string) =>
  request<Order>('/orders', {
    method: 'POST',
    headers: { 'Idempotency-Key': idempotencyKey },
    body: JSON.stringify({
      mode,
      method,
      items: cart.map((i) => ({
        productId: i.product.id,
        qty: i.qty,
        extraIds: i.extras.map((e) => e.id),
        removed: i.removed,
      })),
    }),
  })
