import { Module } from '@nestjs/common'
import { OrdersModule } from '../orders/orders.module'
import { CouponsController } from './coupons.controller'

@Module({ imports: [OrdersModule], controllers: [CouponsController] })
export class CouponsModule {}
