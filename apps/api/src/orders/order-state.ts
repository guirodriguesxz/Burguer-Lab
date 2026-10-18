import { OrderStatus } from '@prisma/client'

/** Máquina de estados do pedido: transições permitidas. */
export const transitions: Record<OrderStatus, OrderStatus[]> = {
  CREATED: ['PAID', 'CANCELED'],
  PAID: ['PREPARING', 'CANCELED'],
  PREPARING: ['READY', 'CANCELED'],
  READY: ['DELIVERED'],
  DELIVERED: [],
  CANCELED: [],
}

export const canTransition = (from: OrderStatus, to: OrderStatus) => transitions[from].includes(to)
