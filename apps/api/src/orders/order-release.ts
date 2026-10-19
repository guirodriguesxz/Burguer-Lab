import { Prisma } from '@prisma/client'

/**
 * Devolve o que um pedido que não vai acontecer tinha reservado: estoque dos itens e o uso do cupom.
 * Usado quando a cobrança Pix expira e quando a cozinha cancela um pedido.
 */
export async function releaseOrder(
  tx: Prisma.TransactionClient,
  order: { couponCode: string | null; items: { productId: string; qty: number }[] },
) {
  for (const item of order.items) {
    await tx.product.updateMany({
      where: { id: item.productId, stock: { not: null } },
      data: { stock: { increment: item.qty } },
    })
  }
  if (order.couponCode) {
    await tx.coupon.updateMany({ where: { code: order.couponCode, usedCount: { gt: 0 } }, data: { usedCount: { decrement: 1 } } })
  }
}
