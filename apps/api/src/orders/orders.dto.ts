import { z } from 'zod'

export const createOrderSchema = z.object({
  mode: z.enum(['DINE_IN', 'TAKEAWAY']),
  method: z.enum(['PIX', 'CARD']),
  items: z
    .array(
      z.object({
        productId: z.string(),
        qty: z.number().int().min(1).max(20),
        extraIds: z.array(z.string()).default([]),
        removed: z.array(z.string()).default([]),
      }),
    )
    .min(1),
})
export type CreateOrderDto = z.infer<typeof createOrderSchema>

export const updateStatusSchema = z.object({
  status: z.enum(['PREPARING', 'READY', 'DELIVERED', 'CANCELED']),
})
