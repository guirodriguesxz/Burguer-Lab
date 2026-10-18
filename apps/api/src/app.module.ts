import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { PrismaModule } from './prisma/prisma.module'
import { MenuModule } from './menu/menu.module'
import { OrdersModule } from './orders/orders.module'
import { AuthModule } from './auth/auth.module'
import { RealtimeModule } from './realtime/realtime.module'
import { AdminModule } from './admin/admin.module'

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    RealtimeModule,
    MenuModule,
    OrdersModule,
    AdminModule,
  ],
})
export class AppModule {}
