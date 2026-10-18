import { createHmac, timingSafeEqual } from 'node:crypto'

/** Assinatura HMAC-SHA256 (hex) do corpo bruto, como os PSPs fazem em webhooks. */
export function signPayload(secret: string, rawBody: string | Buffer): string {
  return createHmac('sha256', secret).update(rawBody).digest('hex')
}

/** Comparação em tempo constante para não vazar a assinatura por timing. */
export function verifySignature(secret: string, rawBody: string | Buffer, signature: string | undefined): boolean {
  if (!signature) return false
  const expected = Buffer.from(signPayload(secret, rawBody), 'hex')
  let given: Buffer
  try {
    given = Buffer.from(signature, 'hex')
  } catch {
    return false
  }
  return given.length === expected.length && timingSafeEqual(given, expected)
}
