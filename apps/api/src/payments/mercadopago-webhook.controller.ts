import { Body, Controller, Headers, HttpCode, Inject, NotFoundException, Post, Query, UnauthorizedException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { MercadoPagoPixProvider } from './mercadopago.provider'
import { verifyMercadoPagoSignature } from './mercadopago-signature'
import { PaymentsService } from './payments.service'
import { PixProvider } from './pix.provider'

/**
 * Webhook do Mercado Pago (configure a URL em "Suas integrações > Webhooks"; evento: Pagamentos).
 * O aviso só diz "o pagamento X mudou": a confirmação vem de uma consulta direta à API do Mercado Pago,
 * então uma notificação forjada, mesmo com a assinatura correta, não consegue marcar nada como pago.
 */
@Controller('webhooks')
export class MercadoPagoWebhookController {
  constructor(
    @Inject(PixProvider) private readonly provider: PixProvider,
    private readonly payments: PaymentsService,
    private readonly prisma: PrismaService,
  ) {}

  @Post('mercadopago')
  @HttpCode(200)
  async handle(
    @Query('data.id') dataIdQuery: string | undefined,
    @Query('type') typeQuery: string | undefined,
    @Body() body: { type?: string; data?: { id?: string | number } } | undefined,
    @Headers('x-signature') signature: string | undefined,
    @Headers('x-request-id') requestId: string | undefined,
  ) {
    if (!(this.provider instanceof MercadoPagoPixProvider)) throw new NotFoundException()

    const dataId = dataIdQuery ?? (body?.data?.id !== undefined ? String(body.data.id) : undefined)
    const ok = verifyMercadoPagoSignature({
      signatureHeader: signature,
      requestId,
      dataId: dataIdQuery ?? dataId,
      secret: process.env.MP_WEBHOOK_SECRET ?? '', // obrigatório na inicialização (ver PaymentsModule)
    })
    if (!ok) throw new UnauthorizedException('Assinatura inválida')

    // Só pagamentos interessam; outros tipos de evento são reconhecidos e ignorados.
    const type = typeQuery ?? body?.type
    if (type !== 'payment' || !dataId) return { ok: true, ignored: true }

    const remote = await this.provider.getPayment(dataId)
    if (remote.status !== 'approved') return { ok: true, status: remote.status }

    const txid = remote.external_reference
    if (!txid) return { ok: true, ignored: true }
    const payment = await this.prisma.payment.findUnique({ where: { txid } })
    // O id confere com o que guardamos na criação: um pagamento qualquer da conta não confirma pedido nosso.
    if (!payment || payment.providerRef !== String(remote.id)) throw new NotFoundException('Cobrança não encontrada')

    return this.payments.confirmPix(txid, Math.round(remote.transaction_amount * 100))
  }
}
