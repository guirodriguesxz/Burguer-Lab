import { Module } from '@nestjs/common'
import { OrdersModule } from '../orders/orders.module'
import { PaymentsModule } from '../payments/payments.module'
import { AdminController } from './admin.controller'
import { ReportsService } from './reports.service'

@Module({ imports: [OrdersModule, PaymentsModule], controllers: [AdminController], providers: [ReportsService] })
export class AdminModule {}
