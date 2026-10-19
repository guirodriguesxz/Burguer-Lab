import { Module } from '@nestjs/common'
import { OrdersModule } from '../orders/orders.module'
import { PaymentsModule } from '../payments/payments.module'
import { AdminController } from './admin.controller'
import { OrdersHistoryController } from './orders-history.controller'
import { UsersController } from './users.controller'
import { ReportsService } from './reports.service'

@Module({ imports: [OrdersModule, PaymentsModule], controllers: [AdminController, UsersController, OrdersHistoryController], providers: [ReportsService] })
export class AdminModule {}
