import { BadRequestException, Controller, Get, Query, UseGuards } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { z } from 'zod'
import { AuthGuard } from '../auth/auth.guard'
import { Roles } from '../auth/roles.decorator'
import { PrismaService } from '../prisma/prisma.service'

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const querySchema = z.object({
  from: date.optional(),
  to: date.optional(),
  /** prefixo da ação, ex.: "product." ou "auth." */
  action: z.string().trim().max(60).optional(),
  actor: z.string().trim().max(254).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(30),
})
const DAY_MS = 24 * 60 * 60 * 1000

/** Consulta da trilha de auditoria (somente ADMIN). Datas no fuso de São Paulo (UTC-3). */
@Controller('admin/audit')
@UseGuards(AuthGuard)
@Roles('ADMIN')
export class AuditController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async list(@Query() query: unknown) {
    const parsed = querySchema.safeParse(query)
    if (!parsed.success) throw new BadRequestException('Filtros inválidos')
    const f = parsed.data

    const and: Prisma.AuditLogWhereInput[] = []
    if (f.from) and.push({ at: { gte: new Date(`${f.from}T00:00:00-03:00`) } })
    if (f.to) and.push({ at: { lt: new Date(new Date(`${f.to}T00:00:00-03:00`).getTime() + DAY_MS) } })
    if (f.action) and.push({ action: { startsWith: f.action } })
    if (f.actor) and.push({ actorEmail: { contains: f.actor, mode: 'insensitive' } })
    const where: Prisma.AuditLogWhereInput = and.length ? { AND: and } : {}

    const [total, items] = await Promise.all([
      this.prisma.auditLog.count({ where }),
      this.prisma.auditLog.findMany({ where, orderBy: { at: 'desc' }, skip: (f.page - 1) * f.pageSize, take: f.pageSize }),
    ])
    return { items, total, page: f.page, pageSize: f.pageSize }
  }
}
