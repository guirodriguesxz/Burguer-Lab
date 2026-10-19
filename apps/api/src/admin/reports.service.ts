import { Injectable } from '@nestjs/common'
import { OrderStatus } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'

const TZ = 'America/Sao_Paulo'
/** Só pedidos efetivamente pagos entram na receita (Pix pendente e cancelados ficam de fora). */
const PAID_STATUSES: OrderStatus[] = ['PAID', 'PREPARING', 'READY', 'DELIVERED']

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Relatório dos últimos `days` dias (pedidos cancelados não entram). */
  async summary(days: number) {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000)

    const [totals, byHourRaw, byDayRaw, top] = await Promise.all([
      this.prisma.order.aggregate({
        where: { createdAt: { gte: since }, status: { in: PAID_STATUSES } },
        _sum: { totalCents: true },
        _count: true,
      }),
      this.prisma.$queryRaw<{ hour: number; orders: number; revenue: number }[]>`
        SELECT EXTRACT(HOUR FROM ("createdAt" AT TIME ZONE 'UTC') AT TIME ZONE ${TZ})::int AS hour,
               COUNT(*)::int AS orders,
               COALESCE(SUM("totalCents"), 0)::int AS revenue
        FROM "Order"
        WHERE "createdAt" >= ${since} AND status::text IN ('PAID','PREPARING','READY','DELIVERED')
        GROUP BY 1 ORDER BY 1`,
      this.prisma.$queryRaw<{ day: string; orders: number; revenue: number }[]>`
        SELECT to_char((("createdAt" AT TIME ZONE 'UTC') AT TIME ZONE ${TZ})::date, 'YYYY-MM-DD') AS day,
               COUNT(*)::int AS orders,
               COALESCE(SUM("totalCents"), 0)::int AS revenue
        FROM "Order"
        WHERE "createdAt" >= ${since} AND status::text IN ('PAID','PREPARING','READY','DELIVERED')
        GROUP BY 1 ORDER BY 1`,
      this.prisma.$queryRaw<{ name: string; qty: number; revenue: number }[]>`
        SELECT oi."productName" AS name,
               SUM(oi.qty)::int AS qty,
               SUM(oi.qty * oi."unitPriceCents")::int AS revenue
        FROM "OrderItem" oi
        JOIN "Order" o ON o.id = oi."orderId"
        WHERE o."createdAt" >= ${since} AND o.status::text IN ('PAID','PREPARING','READY','DELIVERED')
        GROUP BY 1 ORDER BY qty DESC LIMIT 5`,
    ])

    const orders = totals._count
    const revenueCents = totals._sum.totalCents ?? 0
    // Preenche as 24 horas para o gráfico não ter buracos.
    const byHour = Array.from({ length: 24 }, (_, hour) => {
      const row = byHourRaw.find((r) => r.hour === hour)
      return { hour, orders: row?.orders ?? 0, revenueCents: row?.revenue ?? 0 }
    })

    return {
      days,
      orders,
      revenueCents,
      avgTicketCents: orders ? Math.round(revenueCents / orders) : 0,
      byHour,
      byDay: byDayRaw.map((r) => ({ day: r.day, orders: r.orders, revenueCents: r.revenue })),
      topProducts: top.map((r) => ({ name: r.name, qty: r.qty, revenueCents: r.revenue })),
    }
  }
}
