import { Module } from '@nestjs/common'
import { PaymentsModule } from '../payments/payments.module'
import { OrdersController } from './orders.controller'
import { QueueController } from './queue.controller'
import { OrdersService } from './orders.service'
import { PricingService } from './pricing.service'

@Module({
  imports: [PaymentsModule],
  controllers: [OrdersController, QueueController],
  providers: [OrdersService, PricingService],
  exports: [PricingService, OrdersService],
})
export class OrdersModule {}
