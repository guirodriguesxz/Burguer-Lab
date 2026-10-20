import { Controller, Headers, HttpCode, NotFoundException, Param, Post, Req } from '@nestjs/common'
import { isDemoMode } from '../demo/demo'
import { PaymentsService } from './payments.service'

@Controller()
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  /** Webhook chamado pelo provedor Pix. Exige o corpo bruto para validar a assinatura. */
  @Post('webhooks/pix')
  @HttpCode(200)
  webhook(@Req() req: { rawBody?: Buffer }, @Headers('x-signature') signature?: string) {
    return this.payments.handleWebhook(req.rawBody ?? Buffer.alloc(0), signature)
  }

  /** Simula o PSP confirmando o pagamento (desligado em produção, exceto no modo demonstração). */
  @Post('dev/pix/:txid/pay')
  @HttpCode(200)
  simulate(@Param('txid') txid: string) {
    if (process.env.NODE_ENV === 'production' && !isDemoMode()) throw new NotFoundException()
    return this.payments.simulateProviderPayment(txid)
  }
}
