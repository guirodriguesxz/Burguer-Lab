import { Controller, Get } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'

@Controller('menu')
export class MenuController {
  constructor(private readonly prisma: PrismaService) {}

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
