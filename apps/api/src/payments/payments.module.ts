import { Module } from '@nestjs/common'
import { PaymentsController } from './payments.controller'
import { PaymentsService } from './payments.service'
import { MercadoPagoPixProvider } from './mercadopago.provider'
import { MercadoPagoWebhookController } from './mercadopago-webhook.controller'
import { FakePixProvider, PixProvider } from './pix.provider'
import { requireEnv } from '../config'

/**
 * PIX_PROVIDER=mercadopago usa o Mercado Pago (exige MP_ACCESS_TOKEN, MP_WEBHOOK_SECRET e PUBLIC_API_URL);
 * qualquer outro valor usa o simulador.
 */
function pixProviderFactory(): PixProvider {
  if (process.env.PIX_PROVIDER !== 'mercadopago') return new FakePixProvider()
  requireEnv('MP_WEBHOOK_SECRET') // falha ao iniciar: sem segredo não dá para validar o webhook
  return new MercadoPagoPixProvider({
    accessToken: requireEnv('MP_ACCESS_TOKEN'),
    publicApiUrl: requireEnv('PUBLIC_API_URL'),
    payerEmail: process.env.MP_PAYER_EMAIL ?? 'cliente@burgerlab.com.br',
    baseUrl: process.env.MP_BASE_URL,
  })
}

@Module({
  controllers: [PaymentsController, MercadoPagoWebhookController],
  providers: [PaymentsService, { provide: PixProvider, useFactory: pixProviderFactory }],
  exports: [PaymentsService, PixProvider],
})
export class PaymentsModule {}
