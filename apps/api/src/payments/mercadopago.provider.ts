import { Logger } from '@nestjs/common'
import { PixCharge, PixProvider, PixRef } from './pix.provider'

export interface MercadoPagoConfig {
  accessToken: string
  /** E-mail do pagador exigido pela API (o totem não coleta e-mail do cliente). */
  payerEmail: string
  /** URL pública da API, usada como notification_url (ex.: https://loja.com). */
  publicApiUrl: string
  baseUrl?: string
}

/** O Mercado Pago só aceita cobranças Pix que expirem em 30 minutos ou mais. */
const MP_MIN_EXPIRATION_MS = 31 * 60 * 1000

export interface MercadoPagoPayment {
  id: number
  status: string
  external_reference?: string | null
  transaction_amount: number
}

/**
 * Provedor Pix do Mercado Pago (API de Pagamentos, v1).
 * Documentação: https://www.mercadopago.com.br/developers/pt/docs/checkout-api-payments/integration-configuration/integrate-pix
 *
 * NÃO foi testado contra a API real (exige credenciais da conta); os testes automatizados simulam as
 * respostas conforme a documentação. Valide em modo de teste com as credenciais de sandbox antes de usar.
 */
export class MercadoPagoPixProvider extends PixProvider {
  private readonly log = new Logger('MercadoPago')
  private readonly baseUrl: string

  constructor(private readonly cfg: MercadoPagoConfig) {
    super()
    this.baseUrl = cfg.baseUrl ?? 'https://api.mercadopago.com'
  }

  async createCharge({ txid, amountCents }: { txid: string; amountCents: number }): Promise<PixCharge> {
    // Validade local (padrão 5 min) é menor que o mínimo do provedor; o pedido expira aqui e a cobrança é cancelada lá.
    const localTtl = Number(process.env.PIX_TTL_SECONDS ?? 300) * 1000
    const providerExpiry = new Date(Date.now() + Math.max(localTtl, MP_MIN_EXPIRATION_MS))

    const payment = await this.request<{
      id: number
      point_of_interaction?: { transaction_data?: { qr_code?: string } }
    }>('POST', '/v1/payments', {
      idempotencyKey: txid, // reenviar a mesma requisição não gera cobrança duplicada
      body: {
        transaction_amount: amountCents / 100,
        description: 'Pedido Burger Lab',
        payment_method_id: 'pix',
        external_reference: txid,
        notification_url: `${this.cfg.publicApiUrl.replace(/\/$/, '')}/api/webhooks/mercadopago`,
        date_of_expiration: providerExpiry.toISOString().replace('Z', '+00:00'),
        payer: { email: this.cfg.payerEmail },
      },
    })

    const qrCode = payment.point_of_interaction?.transaction_data?.qr_code
    if (!qrCode) throw new Error('Mercado Pago não devolveu o código Pix')
    return { payload: qrCode, expiresAt: new Date(Date.now() + localTtl), providerRef: String(payment.id) }
  }

  async refund({ providerRef, amountCents, txid }: PixRef): Promise<{ refundId: string }> {
    if (!providerRef) throw new Error('Pagamento sem referência no provedor')
    const res = await this.request<{ id: number; status?: string }>('POST', `/v1/payments/${providerRef}/refunds`, {
      idempotencyKey: `refund-${txid}`,
      // Estorno pode ficar "em processamento" (contingência) em vez de falhar.
      headers: { 'X-Render-In-Process-Refunds': 'true' },
      body: { amount: amountCents / 100 },
    })
    return { refundId: String(res.id) }
  }

  async cancelCharge({ providerRef }: PixRef): Promise<void> {
    if (!providerRef) return
    try {
      await this.request('PUT', `/v1/payments/${providerRef}`, { body: { status: 'cancelled' } })
    } catch (e) {
      // Melhor esforço: se não cancelou e o cliente pagar depois, o pagamento tardio é estornado.
      this.log.warn(`Não foi possível cancelar a cobrança ${providerRef}: ${e instanceof Error ? e.message : e}`)
    }
  }

  /** Consulta o pagamento no provedor. O webhook só avisa "algo mudou": a verdade vem desta consulta. */
  getPayment(providerRef: string) {
    return this.request<MercadoPagoPayment>('GET', `/v1/payments/${encodeURIComponent(providerRef)}`)
  }

  private async request<T>(
    method: string,
    path: string,
    opts: { body?: unknown; idempotencyKey?: string; headers?: Record<string, string> } = {},
  ): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.cfg.accessToken}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...(opts.idempotencyKey ? { 'X-Idempotency-Key': opts.idempotencyKey } : {}),
        ...opts.headers,
      },
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      signal: AbortSignal.timeout(15_000),
    })
    if (!res.ok) {
      // Nunca registra o corpo da requisição (pode ter dados do pagador); só o status e a mensagem do provedor.
      const detail = await res.json().catch(() => null)
      throw new Error(`Mercado Pago respondeu ${res.status}${detail?.message ? `: ${String(detail.message).slice(0, 200)}` : ''}`)
    }
    return (await res.json()) as T
  }
}
