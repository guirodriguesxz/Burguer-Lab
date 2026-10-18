import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common'
import { z } from 'zod'
import { normalizeCode } from '../coupons/coupon-rules'
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

const createCouponSchema = z
  .object({
    code: z.string().trim().min(3).max(32),
    type: z.enum(['PERCENT', 'FIXED']),
    value: z.number().int().min(1),
    minOrderCents: z.number().int().min(0).default(0),
    maxUses: z.number().int().min(1).nullable().default(null),
    expiresAt: z.string().datetime().nullable().default(null),
  })
  .refine((c) => c.type !== 'PERCENT' || c.value <= 100, { message: 'Percentual deve ser de 1 a 100', path: ['value'] })

const updateCouponSchema = z
  .object({ active: z.boolean(), maxUses: z.number().int().min(1).nullable() })
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

  @Get('coupons')
  coupons() {
    return this.prisma.coupon.findMany({ orderBy: { createdAt: 'desc' } })
  }

  @Post('coupons')
  async createCoupon(@Body() body: unknown) {
    const parsed = createCouponSchema.safeParse(body)
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten())
    const code = normalizeCode(parsed.data.code)
    if (await this.prisma.coupon.findUnique({ where: { code } })) throw new ConflictException('Já existe um cupom com esse código')
    return this.prisma.coupon.create({
      data: { ...parsed.data, code, expiresAt: parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : null },
    })
  }

  @Patch('coupons/:id')
  async updateCoupon(@Param('id') id: string, @Body() body: unknown) {
    const parsed = updateCouponSchema.safeParse(body)
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten())
    if (!(await this.prisma.coupon.findUnique({ where: { id } }))) throw new NotFoundException('Cupom não encontrado')
    return this.prisma.coupon.update({ where: { id }, data: parsed.data })
  }

  @Get('reports/summary')
  summary(@Query('days') days?: string) {
    const n = Math.min(Math.max(parseInt(days ?? '7', 10) || 7, 1), 90)
    return this.reports.summary(n)
  }
}
