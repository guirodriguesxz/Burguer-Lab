import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { PrismaModule } from './prisma/prisma.module'
import { MenuModule } from './menu/menu.module'
import { OrdersModule } from './orders/orders.module'
import { AuthModule } from './auth/auth.module'
import { RealtimeModule } from './realtime/realtime.module'
import { AdminModule } from './admin/admin.module'
import { PaymentsModule } from './payments/payments.module'
import { CouponsModule } from './coupons/coupons.module'
import { DemoController } from './demo/demo.controller'
import { HealthController } from './health/health.controller'
import { MailModule } from './mail/mail.module'
import { AuditModule } from './audit/audit.module'
import { ObservabilityModule } from './observability/observability.module'

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ObservabilityModule,
    PrismaModule,
    MailModule,
    AuditModule,
    AuthModule,
    RealtimeModule,
    MenuModule,
    PaymentsModule,
    OrdersModule,
    CouponsModule,
    AdminModule,
  ],
  controllers: [HealthController, DemoController],
})
export class AppModule {}
