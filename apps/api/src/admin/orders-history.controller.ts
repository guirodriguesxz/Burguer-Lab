import { BadRequestException, Controller, Get, Header, Query, Req, StreamableFile, UseGuards } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { z } from 'zod'
import { AuthGuard } from '../auth/auth.guard'
import { actorOf, AuditService } from '../audit/audit.service'
import { Roles, SessionUser } from '../auth/roles.decorator'
import { PrismaService } from '../prisma/prisma.service'
import { csvFile, moneyBr } from './csv'

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)

const querySchema = z.object({
  from: date.optional(),
  to: date.optional(),
  status: z.enum(['CREATED', 'PAID', 'PREPARING', 'READY', 'DELIVERED', 'CANCELED']).optional(),
  method: z.enum(['PIX', 'CARD', 'CASH']).optional(),
  refund: z.enum(['REFUNDED', 'REFUND_FAILED']).optional(),
  q: z.string().trim().max(40).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
})

/** Limite de linhas do CSV: protege o servidor e o Excel de um arquivo gigante. */
const CSV_MAX_ROWS = 5000
const DAY_MS = 24 * 60 * 60 * 1000
const include = { items: true, payment: true } as const

/** Histórico de pedidos com filtros e exportação (somente ADMIN). Datas no fuso de São Paulo (UTC-3). */
@Controller('admin/orders')
@UseGuards(AuthGuard)
@Roles('ADMIN')
export class OrdersHistoryController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private parse(query: unknown) {
    const parsed = querySchema.safeParse(query)
    if (!parsed.success) throw new BadRequestException('Filtros inválidos')
    return parsed.data
  }

  private where(f: z.infer<typeof querySchema>): Prisma.OrderWhereInput {
    const and: Prisma.OrderWhereInput[] = []
    if (f.from) and.push({ createdAt: { gte: new Date(`${f.from}T00:00:00-03:00`) } })
    if (f.to) and.push({ createdAt: { lt: new Date(new Date(`${f.to}T00:00:00-03:00`).getTime() + DAY_MS) } })
    if (f.status) and.push({ status: f.status })
    if (f.method) and.push({ payment: { is: { method: f.method } } })
    if (f.refund) and.push({ payment: { is: { status: f.refund } } })
    if (f.q) {
      const q = f.q
      const or: Prisma.OrderWhereInput[] = [
        { clientRef: { equals: q, mode: 'insensitive' } },
        { couponCode: { equals: q, mode: 'insensitive' } },
        { items: { some: { productName: { contains: q, mode: 'insensitive' } } } },
      ]
      if (/^\d{1,9}$/.test(q)) or.push({ ticket: Number(q) }, { number: Number(q) })
      and.push({ OR: or })
    }
    return and.length ? { AND: and } : {}
  }

  @Get()
  async list(@Query() query: unknown) {
    const f = this.parse(query)
    const where = this.where(f)
    const [total, items] = await Promise.all([
      this.prisma.order.count({ where }),
      this.prisma.order.findMany({ where, include, orderBy: { createdAt: 'desc' }, skip: (f.page - 1) * f.pageSize, take: f.pageSize }),
    ])
    return { items, total, page: f.page, pageSize: f.pageSize }
  }

  @Get('export.csv')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="pedidos.csv"')
  async export(@Query() query: unknown, @Req() req: { user: SessionUser; ip?: string }) {
    const f = this.parse(query)
    const orders = await this.prisma.order.findMany({ where: this.where(f), include, orderBy: { createdAt: 'desc' }, take: CSV_MAX_ROWS })
    // Exportar dados em massa é exatamente o que se quer poder rastrear.
    const { page: _p, pageSize: _s, ...filters } = f
    await this.audit.record(actorOf(req), 'export.orders_csv', { meta: { rows: orders.length, filters }, ip: req.ip })

    const rows: unknown[][] = [
      ['Senha', 'Pedido', 'Data/hora', 'Status', 'Modo', 'Pagamento', 'Status do pagamento', 'Subtotal', 'Desconto', 'Total', 'Cupom', 'Código offline', 'Itens'],
      ...orders.map((o) => [
        o.ticket,
        o.number,
        new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'medium', timeZone: 'America/Sao_Paulo' }).format(o.createdAt),
        o.status,
        o.mode === 'DINE_IN' ? 'Local' : 'Viagem',
        o.payment?.method ?? '',
        o.payment?.status ?? '',
        moneyBr(o.totalCents + o.discountCents),
        moneyBr(o.discountCents),
        moneyBr(o.totalCents),
        o.couponCode ?? '',
        o.clientRef ?? '',
        o.items.map((i) => `${i.qty}x ${i.productName}`).join(' | '),
      ]),
    ]
    return new StreamableFile(Buffer.from(csvFile(rows), 'utf8'))
  }
}
