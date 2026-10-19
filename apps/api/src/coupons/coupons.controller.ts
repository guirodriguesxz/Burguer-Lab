import { BadRequestException, Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common'
import { Throttle, ThrottlerGuard } from '@nestjs/throttler'
import { z } from 'zod'
import { PricingService } from '../orders/pricing.service'
import { orderItemSchema } from '../orders/orders.dto'
import { PrismaService } from '../prisma/prisma.service'
import { evaluateCoupon, normalizeCode } from './coupon-rules'

const validateSchema = z.object({
  code: z.string().trim().min(1).max(32),
  items: z.array(orderItemSchema).min(1),
})

@Controller('coupons')
export class CouponsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pricing: PricingService,
  ) {}

  /** Pré-visualiza o desconto no totem. Não consome o cupom: o uso é reservado ao criar o pedido. */
  @Post('validate')
  @HttpCode(200)
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: Number(process.env.COUPON_RATE_LIMIT ?? 20), ttl: 60_000 } })
  async validate(@Body() body: unknown) {
    const parsed = validateSchema.safeParse(body)
    if (!parsed.success) throw new BadRequestException('Dados inválidos')
    const { subtotalCents } = await this.pricing.price(parsed.data.items, this.prisma)
    const coupon = await this.prisma.coupon.findUnique({ where: { code: normalizeCode(parsed.data.code) } })
    const result = evaluateCoupon(coupon, subtotalCents)
    if (!result.ok) return { valid: false, reason: result.reason, code: result.code, minOrderCents: result.minOrderCents }
    return {
      valid: true,
      code: coupon!.code,
      subtotalCents,
      discountCents: result.discountCents,
      totalCents: subtotalCents - result.discountCents,
    }
  }
}
