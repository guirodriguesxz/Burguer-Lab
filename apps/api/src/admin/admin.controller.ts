import { BadRequestException, Body, Controller, Get, NotFoundException, Param, Patch, Query, UseGuards } from '@nestjs/common'
import { z } from 'zod'
import { AuthGuard } from '../auth/auth.guard'
import { Roles } from '../auth/roles.decorator'
import { PrismaService } from '../prisma/prisma.service'
import { RealtimeGateway } from '../realtime/realtime.gateway'
import { ReportsService } from './reports.service'

const updateProductSchema = z
  .object({
    priceCents: z.number().int().min(1).max(1_000_000),
    available: z.boolean(),
    stock: z.number().int().min(0).nullable(),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'Nenhum campo para atualizar')

@Controller('admin')
@UseGuards(AuthGuard)
@Roles('ADMIN')
export class AdminController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reports: ReportsService,
    private readonly realtime: RealtimeGateway,
  ) {}

  @Get('products')
  products() {
    return this.prisma.product.findMany({ orderBy: [{ categoryId: 'asc' }, { name: 'asc' }] })
  }

  @Patch('products/:id')
  async updateProduct(@Param('id') id: string, @Body() body: unknown) {
    const parsed = updateProductSchema.safeParse(body)
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten())
    const exists = await this.prisma.product.findUnique({ where: { id } })
    if (!exists) throw new NotFoundException('Produto não encontrado')
    const product = await this.prisma.product.update({ where: { id }, data: parsed.data })
    this.realtime.menuChanged()
    return product
  }

  @Get('reports/summary')
  summary(@Query('days') days?: string) {
    const n = Math.min(Math.max(parseInt(days ?? '7', 10) || 7, 1), 90)
    return this.reports.summary(n)
  }
}
