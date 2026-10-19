import { z } from 'zod'

export const orderItemSchema = z.object({
  productId: z.string().max(64),
  qty: z.number().int().min(1).max(20),
  extraIds: z.array(z.string().max(64)).max(10).default([]),
  removed: z.array(z.string().max(40)).max(10).default([]),
})

export const createOrderSchema = z.object({
  mode: z.enum(['DINE_IN', 'TAKEAWAY']),
  method: z.enum(['PIX', 'CARD']),
  items: z.array(orderItemSchema).min(1).max(30),
  couponCode: z.string().trim().max(32).optional(),
  /** Código curto gerado no totem; identifica pedidos criados offline. */
  clientRef: z.string().trim().regex(/^[A-Za-z0-9]{3,12}$/).optional(),
})
export type CreateOrderDto = z.infer<typeof createOrderSchema>

export const updateStatusSchema = z.object({
  status: z.enum(['PREPARING', 'READY', 'DELIVERED', 'CANCELED']),
})
