import { Controller, Get, Query } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'

@Controller('menu')
export class MenuController {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Sugestões para o carrinho: para cada categoria "complementar" que falta (bebida, acompanhamento,
   * sobremesa), o item disponível mais vendido nos últimos 30 dias (ou o mais barato, sem histórico).
   */
  @Get('upsell')
  async upsell(@Query('productIds') productIds = '') {
    const inCart = productIds.split(',').filter(Boolean)
    const cartProducts = await this.prisma.product.findMany({ where: { id: { in: inCart } }, select: { categoryId: true } })
    const has = new Set(cartProducts.map((p) => p.categoryId))
    const hasCombo = has.has('combos')

    const wanted = [
      { category: 'drinks', reason: 'Que tal uma bebida?', skip: hasCombo },
      { category: 'sides', reason: 'Acompanha uma porção?', skip: hasCombo },
      { category: 'desserts', reason: 'Fechar com uma sobremesa?', skip: false },
    ].filter((w) => !w.skip && !has.has(w.category))
    if (wanted.length === 0) return []

    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    const sold = await this.prisma.orderItem.groupBy({
      by: ['productId'],
      where: { order: { createdAt: { gte: since }, status: { not: 'CANCELED' } } },
      _sum: { qty: true },
    })
    const sales = new Map(sold.map((s) => [s.productId, s._sum.qty ?? 0]))

    const candidates = await this.prisma.product.findMany({
      where: { categoryId: { in: wanted.map((w) => w.category) }, available: true, OR: [{ stock: null }, { stock: { gt: 0 } }] },
    })

    return wanted.flatMap((w) => {
      const best = candidates
        .filter((p) => p.categoryId === w.category)
        .sort((a, b) => (sales.get(b.id) ?? 0) - (sales.get(a.id) ?? 0) || a.priceCents - b.priceCents)[0]
      return best ? [{ reason: w.reason, product: { id: best.id, name: best.name, emoji: best.emoji, priceCents: best.priceCents } }] : []
    })
  }

  @Get()
  async getMenu() {
    const [categories, products] = await Promise.all([
      this.prisma.category.findMany({ orderBy: { position: 'asc' } }),
      this.prisma.product.findMany({ include: { extras: true }, orderBy: { priceCents: 'asc' } }),
    ])
    return {
      categories,
      products: products.map((p) => ({
        id: p.id,
        name: p.name,
        description: p.description,
        priceCents: p.priceCents,
        emoji: p.emoji,
        category: p.categoryId,
        removable: p.removable,
        extras: p.extras,
        // Indisponível se desativado manualmente ou com estoque zerado.
        available: p.available && (p.stock === null || p.stock > 0),
      })),
    }
  }
}
