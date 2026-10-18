import { BadRequestException, Body, Controller, Get, Headers, Param, Patch, Post, Query, UseGuards } from '@nestjs/common'
import { OrderStatus } from '@prisma/client'
import { AuthGuard } from '../auth/auth.guard'
import { Roles } from '../auth/roles.decorator'
import { createOrderSchema, updateStatusSchema } from './orders.dto'
import { OrdersService } from './orders.service'

@Controller('orders')
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Post()
  create(@Body() body: unknown, @Headers('idempotency-key') key?: string) {
    const parsed = createOrderSchema.safeParse(body)
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten())
    return this.orders.create(parsed.data, key)
  }

  @Get()
  @UseGuards(AuthGuard)
  @Roles('KITCHEN', 'ADMIN')
  list(@Query('status') status?: string) {
    const list = status ? (status.split(',') as OrderStatus[]) : undefined
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
