import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { OrderStatus } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import { RealtimeGateway } from '../realtime/realtime.gateway'
import { CreateOrderDto } from './orders.dto'
import { canTransition } from './order-state'

const include = { items: true, payment: true } as const

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeGateway,
  ) {}

  /**
   * Cria o pedido já pago (pagamento simulado). Preços são sempre calculados no servidor
   * e o estoque é baixado na mesma transação.
   */
  async create(dto: CreateOrderDto, idempotencyKey?: string) {
    if (idempotencyKey) {
      const existing = await this.prisma.payment.findUnique({
        where: { idempotencyKey },
        include: { order: { include } },
      })
      if (existing) return existing.order
    }

    const order = await this.prisma.$transaction(async (tx) => {
      const ids = [...new Set(dto.items.map((i) => i.productId))]
      const products = await tx.product.findMany({ where: { id: { in: ids } }, include: { extras: true } })
      const byId = new Map(products.map((p) => [p.id, p]))

      let total = 0
      const items = dto.items.map((i) => {
        const p = byId.get(i.productId)
        if (!p) throw new BadRequestException(`Produto inexistente: ${i.productId}`)
        if (!p.available) throw new ConflictException(`${p.name} está indisponível`)
        const extras = i.extraIds.map((eid) => {
          const e = p.extras.find((x) => x.id === eid)
          if (!e) throw new BadRequestException(`Adicional inválido: ${eid}`)
          return { id: e.id, name: e.name, priceCents: e.priceCents }
        })
        const unit = p.priceCents + extras.reduce((s, e) => s + e.priceCents, 0)
        total += unit * i.qty
        return { productId: p.id, productName: p.name, qty: i.qty, unitPriceCents: unit, extras, removed: i.removed }
      })

      // Baixa de estoque condicional: falha se outro pedido esgotou o item no meio do caminho.
      const demand = new Map<string, number>()
      for (const i of dto.items) demand.set(i.productId, (demand.get(i.productId) ?? 0) + i.qty)
      for (const [productId, qty] of demand) {
        const p = byId.get(productId)!
        if (p.stock === null) continue
        const res = await tx.product.updateMany({
          where: { id: productId, stock: { gte: qty } },
          data: { stock: { decrement: qty } },
        })
        if (res.count === 0) throw new ConflictException(`Estoque insuficiente de ${p.name}`)
      }

      return tx.order.create({
        data: {
          mode: dto.mode,
          totalCents: total,
          status: 'PAID',
          items: { create: items },
          payment: { create: { method: dto.method, amountCents: total, idempotencyKey } },
          history: { create: [{ to: 'CREATED' }, { from: 'CREATED', to: 'PAID' }] },
        },
        include,
      })
    })

    // Notifica depois do commit: a cozinha vê o pedido e o totem recarrega o estoque.
    this.realtime.orderCreated(order)
    this.realtime.menuChanged()
    return order
  }

  list(status?: OrderStatus[]) {
    return this.prisma.order.findMany({
      where: status ? { status: { in: status } } : undefined,
      include,
      orderBy: { number: 'asc' },
    })
  }

  async transition(id: string, to: OrderStatus) {
    const order = await this.prisma.order.findUnique({ where: { id } })
    if (!order) throw new NotFoundException('Pedido não encontrado')
    if (!canTransition(order.status, to)) {
      throw new ConflictException(`Transição inválida: ${order.status} → ${to}`)
    }
    const updated = await this.prisma.order.update({
      where: { id },
      data: { status: to, history: { create: { from: order.status, to } } },
      include,
    })
    this.realtime.orderUpdated(updated)
    return updated
  }
}
