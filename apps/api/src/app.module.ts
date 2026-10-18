import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { PrismaModule } from './prisma/prisma.module'
import { MenuModule } from './menu/menu.module'
import { OrdersModule } from './orders/orders.module'

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), PrismaModule, MenuModule, OrdersModule],
})
export class AppModule {}
