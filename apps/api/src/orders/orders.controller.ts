import { BadRequestException, Body, Controller, Get, Headers, Param, Patch, Post, Query, UseGuards } from '@nestjs/common'
import { OrderStatus } from '@prisma/client'
import { AuthGuard } from '../auth/auth.guard'
import { Roles } from '../auth/roles.decorator'
import { Throttle, ThrottlerGuard } from '@nestjs/throttler'
import { z } from 'zod'
import { createOrderSchema, updateStatusSchema } from './orders.dto'
import { OrdersService } from './orders.service'

const statusFilterSchema = z.array(z.enum(['CREATED', 'PAID', 'PREPARING', 'READY', 'DELIVERED', 'CANCELED'])).max(6)

@Controller('orders')
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  // Criar pedido é público (o totem não faz login): limita abuso por IP. O teto é folgado, pois vários
  // totens de uma loja podem compartilhar o mesmo IP.
  @Post()
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: Number(process.env.ORDER_RATE_LIMIT ?? 40), ttl: 60_000 } })
  create(@Body() body: unknown, @Headers('idempotency-key') key?: string) {
    const parsed = createOrderSchema.safeParse(body)
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten())
    return this.orders.create(parsed.data, key)
  }

  @Get(':id/status')
  status(@Param('id') id: string) {
    return this.orders.publicStatus(id)
  }

  @Get()
  @UseGuards(AuthGuard)
  @Roles('KITCHEN', 'ADMIN')
  list(@Query('status') status?: string) {
    let list: OrderStatus[] | undefined
    if (status) {
      const parsed = statusFilterSchema.safeParse(status.split(','))
      if (!parsed.success) throw new BadRequestException('Filtro de status inválido')
      list = parsed.data
    }
    return this.orders.list(list)
  }

  @Patch(':id/status')
  @UseGuards(AuthGuard)
  @Roles('KITCHEN', 'ADMIN')
  updateStatus(@Param('id') id: string, @Body() body: unknown) {
    const parsed = updateStatusSchema.safeParse(body)
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten())
    return this.orders.transition(id, parsed.data.status)
  }
}
