import { Module } from '@nestjs/common'
import { PaymentsController } from './payments.controller'
import { PaymentsService } from './payments.service'
import { FakePixProvider, PixProvider } from './pix.provider'

@Module({
  controllers: [PaymentsController],
  providers: [PaymentsService, { provide: PixProvider, useClass: FakePixProvider }],
  exports: [PaymentsService, PixProvider],
})
export class PaymentsModule {}
