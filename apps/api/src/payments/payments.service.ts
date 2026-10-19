import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
  UnauthorizedException,
} from '@nestjs/common'
import { z } from 'zod'
import { requireSecret } from '../config'
import { releaseOrder } from '../orders/order-release'
import { PrismaService } from '../prisma/prisma.service'
import { RealtimeGateway } from '../realtime/realtime.gateway'
import { signPayload, verifySignature } from './signature'

const webhookSchema = z.object({
  txid: z.string().min(1),
  status: z.literal('PAID'),
  amountCents: z.number().int().positive(),
})

const orderInclude = { items: true, payment: true } as const
const secret = () => requireSecret('PIX_WEBHOOK_SECRET', 'dev-webhook-secret')

@Injectable()
export class PaymentsService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(PaymentsService.name)
  private timer?: NodeJS.Timeout

  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeGateway,
  ) {}

  onModuleInit() {
    this.timer = setInterval(() => this.expirePending().catch((e) => this.log.error(e)), 30_000)
    this.timer.unref()
  }

  onModuleDestroy() {
    clearInterval(this.timer)
  }

  /** Entrada do webhook: valida assinatura e corpo, depois confirma o pagamento. */
  async handleWebhook(rawBody: Buffer | string, signature: string | undefined) {
    if (!verifySignature(secret(), rawBody, signature)) throw new UnauthorizedException('Assinatura inválida')
    let json: unknown
    try {
      json = JSON.parse(rawBody.toString())
    } catch {
      throw new BadRequestException('Corpo inválido')
    }
    const parsed = webhookSchema.safeParse(json)
    if (!parsed.success) throw new BadRequestException('Evento não suportado')
    return this.confirmPix(parsed.data.txid, parsed.data.amountCents)
  }

  /** Idempotente: o PSP pode reenviar o mesmo evento várias vezes. */
  async confirmPix(txid: string, amountCents: number): Promise<{ ok: true; alreadyProcessed: boolean }> {
    const payment = await this.prisma.payment.findUnique({ where: { txid } })
    if (!payment) throw new NotFoundException('Cobrança não encontrada')
    if (payment.amountCents !== amountCents) throw new BadRequestException('Valor diferente do cobrado')
    if (payment.status === 'PAID') return { ok: true, alreadyProcessed: true }
    if (payment.status === 'EXPIRED') throw new ConflictException('Cobrança expirada: o pedido foi cancelado')

    const confirmed = await this.prisma.$transaction(async (tx) => {
      // Só um vencedor entre confirmação e expiração concorrentes.
      const claim = await tx.payment.updateMany({
        where: { id: payment.id, status: 'PENDING' },
        data: { status: 'PAID', paidAt: new Date() },
      })
      if (claim.count === 0) return null
      // Só um pedido ainda "CREATED" pode virar PAID. Se foi cancelado nesse meio tempo, desfaz tudo (rollback):
      // o webhook responde 409 e a cobrança continua pendente para ser tratada, em vez de "ressuscitar" o pedido.
      const moved = await tx.order.updateMany({ where: { id: payment.orderId, status: 'CREATED' }, data: { status: 'PAID' } })
      if (moved.count === 0) throw new ConflictException('Pedido não está mais aguardando pagamento')
      await tx.orderEvent.create({ data: { orderId: payment.orderId, from: 'CREATED', to: 'PAID' } })
      return tx.order.findUniqueOrThrow({ where: { id: payment.orderId }, include: orderInclude })
    })

    if (!confirmed) return this.confirmPix(txid, amountCents)
    this.realtime.orderCreated(confirmed)
    return { ok: true, alreadyProcessed: false }
  }

  /** Cancela pedidos Pix não pagos a tempo e devolve estoque e uso de cupom. */
  async expirePending(now = new Date()) {
    const pending = await this.prisma.payment.findMany({
      where: { status: 'PENDING', expiresAt: { lt: now } },
      include: { order: { include: { items: true } } },
    })

    let expired = 0
    for (const p of pending) {
      const done = await this.prisma.$transaction(async (tx) => {
        const claim = await tx.payment.updateMany({ where: { id: p.id, status: 'PENDING' }, data: { status: 'EXPIRED' } })
        if (claim.count === 0) return false // foi pago no meio do caminho

        await tx.order.update({
          where: { id: p.orderId },
          data: { status: 'CANCELED', history: { create: { from: 'CREATED', to: 'CANCELED' } } },
        })
        await releaseOrder(tx, p.order)
        return true
      })
      if (done) expired++
    }

    if (expired > 0) this.realtime.menuChanged()
    return expired
  }

  /** Apenas desenvolvimento: faz o papel do PSP, enviando um webhook assinado para o fluxo real. */
  async simulateProviderPayment(txid: string) {
    const payment = await this.prisma.payment.findUnique({ where: { txid } })
    if (!payment) throw new NotFoundException('Cobrança não encontrada')
    const body = JSON.stringify({ txid, status: 'PAID', amountCents: payment.amountCents })
    return this.handleWebhook(body, signPayload(secret(), body))
  }
}
