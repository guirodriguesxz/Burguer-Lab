import { Injectable } from '@nestjs/common'

export interface PixCharge {
  /** Código "copia e cola" que vira QR Code no totem. */
  payload: string
  expiresAt: Date
  /** Id da cobrança no provedor (necessário para estornar e cancelar). */
  providerRef?: string
}

export interface PixRef {
  txid: string
  providerRef?: string | null
  amountCents: number
}

/**
 * Contrato de um provedor Pix. Trocar o simulado por Mercado Pago/Stripe/PSP real
 * é implementar esta interface; o restante do sistema (webhook, expiração) não muda.
 */
export abstract class PixProvider {
  abstract createCharge(input: { txid: string; amountCents: number }): Promise<PixCharge>
  /** Devolve o valor ao pagador. Deve lançar erro se o provedor recusar (o sistema marca REFUND_FAILED e permite tentar de novo). */
  abstract refund(input: PixRef): Promise<{ refundId: string }>
  /**
   * Cancela uma cobrança ainda não paga, para que ninguém consiga pagá-la depois que o pedido expirou.
   * Melhor esforço: se falhar, o pagamento tardio é estornado automaticamente.
   */
  abstract cancelCharge(input: PixRef): Promise<void>
}

/** Provedor de teste: não fala com nenhum banco, só gera uma cobrança com formato plausível. */
@Injectable()
export class FakePixProvider extends PixProvider {
  async createCharge({ txid, amountCents }: { txid: string; amountCents: number }): Promise<PixCharge> {
    const ttl = Number(process.env.PIX_TTL_SECONDS ?? 300)
    const amount = (amountCents / 100).toFixed(2)
    const payload = `00020126BURGERLAB-TESTE${txid}5204000053039865406${amount}5802BR5909BURGERLAB6009SAOPAULO6304TEST`
    return { payload, expiresAt: new Date(Date.now() + ttl * 1000) }
  }

  async refund({ txid }: PixRef) {
    return { refundId: `fake-refund-${txid.slice(0, 8)}-${Date.now()}` }
  }

  async cancelCharge() {
    // nada a cancelar: a cobrança simulada só existe aqui
  }
}
