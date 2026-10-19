const fs = require('fs')
const edit = (file, pairs) => {
  let s = fs.readFileSync(file, 'utf8')
  for (const [from, to, all] of pairs) {
    if (!s.includes(from)) { console.log('NAO ACHOU em', file, ':', from.slice(0, 70)); process.exitCode = 1; continue }
    s = all ? s.split(from).join(to) : s.replace(from, to)
  }
  fs.writeFileSync(file, s)
}

// Relatórios: só pedidos cujo pagamento está efetivamente PAGO (estornados e pendentes ficam de fora)
edit('src/admin/reports.service.ts', [
  [`        where: { createdAt: { gte: since }, status: { in: PAID_STATUSES } },`, `        where: { createdAt: { gte: since }, status: { in: PAID_STATUSES }, payment: { is: { status: 'PAID' } } },`],
  [`        WHERE "createdAt" >= \${since} AND status::text IN ('PAID','PREPARING','READY','DELIVERED')`, `        WHERE "createdAt" >= \${since} AND status::text IN ('PAID','PREPARING','READY','DELIVERED')
          AND EXISTS (SELECT 1 FROM "Payment" p WHERE p."orderId" = "Order".id AND p.status::text = 'PAID')`, true],
  [`        WHERE o."createdAt" >= \${since} AND o.status::text IN ('PAID','PREPARING','READY','DELIVERED')`, `        WHERE o."createdAt" >= \${since} AND o.status::text IN ('PAID','PREPARING','READY','DELIVERED')
          AND EXISTS (SELECT 1 FROM "Payment" p WHERE p."orderId" = o.id AND p.status::text = 'PAID')`],
])

// Admin: estorno manual (inclui nova tentativa de estorno que falhou)
edit('src/admin/admin.controller.ts', [
  [`  @Get('reports/summary')`, `  /**
   * Estorno manual. Pedido ainda em andamento é cancelado (devolve estoque e cupom) e estornado;
   * pedido já entregue só tem o pagamento estornado. Também serve para tentar de novo um estorno que falhou.
   */
  @Post('orders/:id/refund')
  @HttpCode(200)
  async refund(@Param('id') id: string) {
    const order = await this.prisma.order.findUnique({ where: { id }, include: { payment: true } })
    if (!order || !order.payment) throw new NotFoundException('Pedido não encontrado')

    if (order.payment.status === 'PAID' && canTransition(order.status, 'CANCELED')) {
      return this.orders.transition(id, 'CANCELED') // cancela, devolve estoque e estorna
    }
    await this.payments.refundPayment(id) // entregue, ou nova tentativa de um estorno que falhou
    return this.prisma.order.findUniqueOrThrow({ where: { id }, include: { items: true, payment: true } })
  }

  @Get('reports/summary')`],
  [`    private readonly realtime: RealtimeGateway,
    ) {}`, `    private readonly realtime: RealtimeGateway,
    private readonly orders: OrdersService,
    private readonly payments: PaymentsService,
  ) {}`],
  [`import { normalizeCode } from '../coupons/coupon-rules'`, `import { normalizeCode } from '../coupons/coupon-rules'
import { canTransition } from '../orders/order-state'
import { OrdersService } from '../orders/orders.service'
import { PaymentsService } from '../payments/payments.service'`],
  [`  ConflictException,
  Controller,
  Get,`, `  ConflictException,
  Controller,
  Get,
  HttpCode,`],
])

edit('src/admin/admin.module.ts', [
  [`import { Module } from '@nestjs/common'`, `import { Module } from '@nestjs/common'
import { OrdersModule } from '../orders/orders.module'
import { PaymentsModule } from '../payments/payments.module'`],
  [`@Module({ controllers`, `@Module({ imports: [OrdersModule, PaymentsModule], controllers`],
])

edit('src/orders/orders.module.ts', [[`  exports: [PricingService],`, `  exports: [PricingService, OrdersService],`]])

// Seed: usuário do caixa
edit('prisma/seed.ts', [
  [`      { email: 'cozinha@burgerlab.dev', name: 'Cozinha', password: 'cozinha123', role: 'KITCHEN' as const },
    ]`, `      { email: 'cozinha@burgerlab.dev', name: 'Cozinha', password: 'cozinha123', role: 'KITCHEN' as const },
      { email: 'caixa@burgerlab.dev', name: 'Caixa', password: 'caixa123', role: 'CASHIER' as const },
    ]`],
  [`  const { ADMIN_EMAIL, ADMIN_PASSWORD, KITCHEN_EMAIL, KITCHEN_PASSWORD } = process.env`, `  const { ADMIN_EMAIL, ADMIN_PASSWORD, KITCHEN_EMAIL, KITCHEN_PASSWORD, CASHIER_EMAIL, CASHIER_PASSWORD } = process.env`],
  [`  return list
}`, `  if (CASHIER_EMAIL && CASHIER_PASSWORD) {
    list.push({ email: CASHIER_EMAIL, name: 'Caixa', password: CASHIER_PASSWORD, role: 'CASHIER' })
  }
  return list
}`],
  [`role: 'ADMIN' | 'KITCHEN' }[]`, `role: 'ADMIN' | 'KITCHEN' | 'CASHIER' }[]`],
])

// Helpers de teste: usuário do caixa
edit('test/helpers.ts', [
  [`      { email: 'kitchen@test.dev', name: 'Cozinha', role: 'KITCHEN', passwordHash: await bcrypt.hash('kitchen-pass', 4) },`, `      { email: 'kitchen@test.dev', name: 'Cozinha', role: 'KITCHEN', passwordHash: await bcrypt.hash('kitchen-pass', 4) },
      { email: 'cashier@test.dev', name: 'Caixa', role: 'CASHIER', passwordHash: await bcrypt.hash('cashier-pass', 4) },`],
  [`export async function loginAs(app: NestExpressApplication, who: 'admin' | 'kitchen') {
  const creds = who === 'admin' ? { email: 'admin@test.dev', password: 'admin-pass' } : { email: 'kitchen@test.dev', password: 'kitchen-pass' }`, `const CREDS = {
  admin: { email: 'admin@test.dev', password: 'admin-pass' },
  kitchen: { email: 'kitchen@test.dev', password: 'kitchen-pass' },
  cashier: { email: 'cashier@test.dev', password: 'cashier-pass' },
}

export async function loginAs(app: NestExpressApplication, who: keyof typeof CREDS) {
  const creds = CREDS[who]`],
])
