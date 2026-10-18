import { BadRequestException, ConflictException, Injectable } from '@nestjs/common'
import { Prisma, Product } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import { CreateOrderDto } from './orders.dto'

type Db = Prisma.TransactionClient | PrismaService

export interface PricedLine {
  productId: string
  productName: string
  qty: number
  unitPriceCents: number
  extras: { id: string; name: string; priceCents: number }[]
  removed: string[]
}

/** Fonte única de preço: o cliente manda só IDs e quantidades, o servidor calcula tudo. */
@Injectable()
export class PricingService {
  async price(items: CreateOrderDto['items'], db: Db) {
    const ids = [...new Set(items.map((i) => i.productId))]
    const products = await db.product.findMany({ where: { id: { in: ids } }, include: { extras: true } })
    const byId = new Map(products.map((p) => [p.id, p]))

    let subtotalCents = 0
    const lines: PricedLine[] = items.map((i) => {
      const p = byId.get(i.productId)
      if (!p) throw new BadRequestException(`Produto inexistente: ${i.productId}`)
      if (!p.available) throw new ConflictException(`${p.name} está indisponível`)
      const extras = i.extraIds.map((eid) => {
        const e = p.extras.find((x) => x.id === eid)
        if (!e) throw new BadRequestException(`Adicional inválido: ${eid}`)
        return { id: e.id, name: e.name, priceCents: e.priceCents }
      })
      const unit = p.priceCents + extras.reduce((s, e) => s + e.priceCents, 0)
      subtotalCents += unit * i.qty
      return { productId: p.id, productName: p.name, qty: i.qty, unitPriceCents: unit, extras, removed: i.removed }
    })

    return { lines, subtotalCents, byId: byId as Map<string, Product> }
  }
}
