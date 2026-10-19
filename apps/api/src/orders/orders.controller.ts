import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common'
import { OrderStatus } from '@prisma/client'
import { AuthGuard } from '../auth/auth.guard'
import { AuthUser, Roles } from '../auth/roles.decorator'
import { PaymentsService } from '../payments/payments.service'
import { Throttle, ThrottlerGuard } from '@nestjs/throttler'
import { z } from 'zod'
import { createOrderSchema, updateStatusSchema } from './orders.dto'
import { OrdersService } from './orders.service'

const statusFilterSchema = z.array(z.enum(['CREATED', 'PAID', 'PREPARING', 'READY', 'DELIVERED', 'CANCELED'])).max(6)

@Controller('orders')
export class OrdersController {
  constructor(
    private readonly orders: OrdersService,
    private readonly payments: PaymentsService,
  ) {}

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
  @Roles('KITCHEN', 'ADMIN', 'CASHIER')
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
  @Roles('KITCHEN', 'ADMIN', 'CASHIER')
  updateStatus(@Param('id') id: string, @Body() body: unknown, @Req() req: { user: AuthUser }) {
    const parsed = updateStatusSchema.safeParse(body)
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten())
    if (req.user.role === 'CASHIER') {
      // O caixa só mexe em pedidos que aguardam pagamento, e só para cancelá-los.
      if (parsed.data.status !== 'CANCELED') throw new ForbiddenException('O caixa só pode cancelar pedidos pendentes')
      return this.orders.transition(id, 'CANCELED', { onlyPending: true })
    }
    return this.orders.transition(id, parsed.data.status)
  }

  /** O caixa confirma que recebeu o dinheiro: o pedido segue para a cozinha. */
  @Post(':id/confirm-cash')
  @HttpCode(200)
  @UseGuards(AuthGuard)
  @Roles('CASHIER', 'ADMIN')
  confirmCash(@Param('id') id: string, @Req() req: { user: AuthUser }) {
    return this.payments.confirmCash(id, req.user.sub)
  }
}
