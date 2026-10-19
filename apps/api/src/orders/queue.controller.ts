import { Controller, Get, UseGuards } from '@nestjs/common'
import { Throttle, ThrottlerGuard } from '@nestjs/throttler'
import { PrismaService } from '../prisma/prisma.service'
import { businessDayStart } from './ticket'

/**
 * Fila para a tela de senhas (televisão no salão). Pública e mínima de propósito: só números de senha,
 * nenhum dado de cliente, item ou valor.
 */
@Controller('queue')
export class QueueController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: Number(process.env.QUEUE_RATE_LIMIT ?? 120), ttl: 60_000 } })
  async queue() {
    const orders = await this.prisma.order.findMany({
      where: { status: { in: ['PAID', 'PREPARING', 'READY'] }, createdAt: { gte: businessDayStart() } },
      select: { ticket: true, status: true },
      orderBy: { ticket: 'asc' },
    })
    return {
      preparing: orders.filter((o) => o.status !== 'READY').map((o) => o.ticket),
      ready: orders.filter((o) => o.status === 'READY').map((o) => o.ticket),
    }
  }
}
