import { randomUUID } from 'node:crypto'
import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import { OrderStatus } from '@prisma/client'
import { evaluateCoupon, normalizeCode } from '../coupons/coupon-rules'
import { PaymentsService } from '../payments/payments.service'
import { PixProvider } from '../payments/pix.provider'
import { PrismaService } from '../prisma/prisma.service'
import { RealtimeGateway } from '../realtime/realtime.gateway'
import { CreateOrderDto } from './orders.dto'
import { canTransition } from './order-state'
import { releaseOrder } from './order-release'
import { PricingService } from './pricing.service'
import { nextTicket } from './ticket'
import { MetricsService } from '../observability/metrics.service'

const include = { items: true, payment: true } as const

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeGateway,
    private readonly pricing: PricingService,
    private readonly pix: PixProvider,
    private readonly payments: PaymentsService,
    private readonly metrics: MetricsService,
  ) {}

  /**
   * Cria o pedido. Preço, desconto e estoque são resolvidos no servidor, na mesma transação.
   * - Cartão: nasce PAID e vai direto para a cozinha.
   * - Pix: nasce CREATED com cobrança PENDING; só vai para a cozinha quando o webhook confirmar.
   * - Caixa (dinheiro): nasce CREATED com pagamento PENDING; vai para a cozinha quando o caixa confirmar o
   *   recebimento. Se ninguém pagar a tempo, expira como o Pix.
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
      const { lines, subtotalCents, byId } = await this.pricing.price(dto.items, tx)

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

      let discountCents = 0
      let couponCode: string | undefined
      if (dto.couponCode) {
        const coupon = await tx.coupon.findUnique({ where: { code: normalizeCode(dto.couponCode) } })
        const result = evaluateCoupon(coupon, subtotalCents)
        if (!result.ok) throw new BadRequestException(result.reason)
        // Reserva o uso de forma atômica: dois pedidos simultâneos não passam do limite.
        const claimed = await tx.$executeRaw`
          UPDATE "Coupon" SET "usedCount" = "usedCount" + 1
          WHERE id = ${coupon!.id} AND ("maxUses" IS NULL OR "usedCount" < "maxUses")`
        if (claimed === 0) throw new BadRequestException('Cupom esgotado')
        discountCents = result.discountCents
        couponCode = coupon!.code
      }

      const totalCents = subtotalCents - discountCents
      const isDeferred = dto.method !== 'CARD'

      let payment
      if (dto.method === 'CASH') {
        const ttl = Number(process.env.CASH_TTL_SECONDS ?? 900)
        payment = {
          method: 'CASH' as const,
          amountCents: totalCents,
          status: 'PENDING' as const,
          expiresAt: new Date(Date.now() + ttl * 1000),
          idempotencyKey,
        }
      } else if (dto.method === 'PIX') {
        const txid = randomUUID().replace(/-/g, '')
        const charge = await this.pix.createCharge({ txid, amountCents: totalCents })
        payment = {
          method: 'PIX' as const,
          amountCents: totalCents,
          status: 'PENDING' as const,
          txid,
          pixPayload: charge.payload,
          providerRef: charge.providerRef,
          expiresAt: charge.expiresAt,
          idempotencyKey,
        }
      } else {
        payment = { method: 'CARD' as const, amountCents: totalCents, status: 'PAID' as const, paidAt: new Date(), idempotencyKey }
      }

      // A senha é alocada por último: o contador fica travado até o commit, e o Pix acima fala com um serviço externo.
      const ticket = await nextTicket(tx)

      return tx.order.create({
        data: {
          ticket,
          mode: dto.mode,
          totalCents,
          discountCents,
          couponCode,
          clientRef: dto.clientRef,
          status: isDeferred ? 'CREATED' : 'PAID',
          items: { create: lines },
          payment: { create: payment },
          history: { create: isDeferred ? [{ to: 'CREATED' }] : [{ to: 'CREATED' }, { from: 'CREATED', to: 'PAID' }] },
        },
        include,
      })
    })

    this.metrics.ordersCreated.inc({ method: dto.method })
    if (dto.method === 'CARD') this.metrics.paymentsConfirmed.inc({ method: 'CARD' }) // cartão já nasce pago
    // Notifica depois do commit.
    if (order.status === 'PAID') this.realtime.orderCreated(order)
    else if (dto.method === 'CASH') this.realtime.orderPending(order) // o caixa vê o novo pedido na hora
    this.realtime.menuChanged()
    return order
  }

  /** Limitada às 500 mais recentes: a listagem não cresce sem limite conforme o histórico aumenta. */
  async list(status?: OrderStatus[]) {
    const recent = await this.prisma.order.findMany({
      where: status ? { status: { in: status } } : undefined,
      include,
      orderBy: { number: 'desc' },
      take: 500,
    })
    return recent.reverse()
  }

  /** Consulta pública e mínima, usada pelo totem para aguardar a confirmação do Pix. */
  async publicStatus(id: string) {
    const order = await this.prisma.order.findUnique({ where: { id }, include: { payment: true } })
    if (!order) throw new NotFoundException('Pedido não encontrado')
    return {
      id: order.id,
      number: order.number,
      ticket: order.ticket,
      status: order.status,
      paymentStatus: order.payment?.status ?? null,
      expiresAt: order.payment?.expiresAt ?? null,
    }
  }

  /**
   * @param onlyPending o caixa só pode cancelar pedidos que ainda aguardam pagamento (CREATED)
   */
  async transition(id: string, to: OrderStatus, opts: { onlyPending?: boolean } = {}) {
    const order = await this.prisma.order.findUnique({ where: { id }, include: { items: true, payment: true } })
    if (!order) throw new NotFoundException('Pedido não encontrado')
    if (opts.onlyPending && order.status !== 'CREATED') {
      throw new ForbiddenException('O caixa só pode cancelar pedidos que aguardam pagamento')
    }
    if (!canTransition(order.status, to)) {
      throw new ConflictException(`Transição inválida: ${order.status} → ${to}`)
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      // Troca condicionada ao status lido: se duas telas agirem ao mesmo tempo, só uma vence.
      const claim = await tx.order.updateMany({ where: { id, status: order.status }, data: { status: to } })
      if (claim.count === 0) throw new ConflictException('O pedido mudou de status. Atualize e tente de novo.')
      await tx.orderEvent.create({ data: { orderId: id, from: order.status, to } })

      if (to === 'CANCELED') {
        // Pedido cancelado devolve o estoque e o cupom; uma cobrança Pix ainda pendente deixa de valer.
        await releaseOrder(tx, order)
        await tx.payment.updateMany({ where: { orderId: id, status: 'PENDING' }, data: { status: 'EXPIRED' } })
      }
      return tx.order.findUniqueOrThrow({ where: { id }, include })
    })

    // Pix ainda não pago: cancela a cobrança no provedor para ninguém pagar um pedido cancelado.
    if (to === 'CANCELED' && order.payment?.method === 'PIX' && order.payment.status === 'PENDING') {
      await this.payments.cancelProviderCharge(order.payment)
    }

    // Cancelar um pedido já pago devolve o dinheiro (estorno). Fora da transação: pode falar com o provedor.
    let result = updated
    if (to === 'CANCELED' && order.payment?.status === 'PAID') {
      await this.payments.refundPayment(id)
      result = await this.prisma.order.findUniqueOrThrow({ where: { id }, include })
    }

    this.realtime.orderUpdated(result)
    if (to === 'CANCELED') this.realtime.menuChanged()
    return result
  }
}
