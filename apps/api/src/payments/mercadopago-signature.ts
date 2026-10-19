import { createHmac, timingSafeEqual } from 'node:crypto'

/** Tolerância entre o horário da notificação e o do servidor (protege contra reenvio de notificações antigas). */
export const MP_TIMESTAMP_TOLERANCE_MS = 15 * 60 * 1000

export interface MpSignatureInput {
  /** Cabeçalho x-signature: "ts=1704908010,v1=<hmac>" */
  signatureHeader: string | undefined
  /** Cabeçalho x-request-id */
  requestId: string | undefined
  /** Parâmetro data.id da URL da notificação */
  dataId: string | undefined
  secret: string
  now?: number
}

/**
 * Valida a assinatura de webhook do Mercado Pago:
 * HMAC-SHA256, em hexadecimal, do manifest `id:<data.id>;request-id:<x-request-id>;ts:<ts>;`
 * (o data.id alfanumérico vai em minúsculas). Comparação em tempo constante.
 * Fonte: https://www.mercadopago.com.br/developers/pt/docs/your-integrations/notifications/webhooks
 */
export function verifyMercadoPagoSignature({ signatureHeader, requestId, dataId, secret, now = Date.now() }: MpSignatureInput): boolean {
  if (!signatureHeader || !dataId || !requestId) return false

  let ts: string | undefined
  let v1: string | undefined
  for (const part of signatureHeader.split(',')) {
    const [key, value] = part.split('=', 2).map((x) => x?.trim())
    if (key === 'ts') ts = value
    if (key === 'v1') v1 = value
  }
  if (!ts || !v1 || !/^\d+$/.test(ts)) return false
  if (Math.abs(now - Number(ts)) > MP_TIMESTAMP_TOLERANCE_MS) return false

  const manifest = `id:${dataId.toLowerCase()};request-id:${requestId};ts:${ts};`
  const expected = Buffer.from(createHmac('sha256', secret).update(manifest).digest('hex'), 'hex')
  const given = Buffer.from(v1, 'hex')
  return given.length === expected.length && timingSafeEqual(given, expected)
}

/** Monta um cabeçalho x-signature válido (usado nos testes e no simulador). */
export function signMercadoPago(secret: string, dataId: string, requestId: string, ts = Date.now()): string {
  const manifest = `id:${dataId.toLowerCase()};request-id:${requestId};ts:${ts};`
  return `ts=${ts},v1=${createHmac('sha256', secret).update(manifest).digest('hex')}`
}
