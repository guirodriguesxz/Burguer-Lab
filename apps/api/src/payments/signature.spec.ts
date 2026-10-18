import { signPayload, verifySignature } from './signature'

describe('webhook signature', () => {
  const secret = 'segredo'
  const body = JSON.stringify({ txid: 'abc', status: 'PAID', amountCents: 1000 })

  it('aceita assinatura válida', () => {
    expect(verifySignature(secret, body, signPayload(secret, body))).toBe(true)
  })

  it('rejeita corpo adulterado, segredo errado e assinatura ausente ou malformada', () => {
    const sig = signPayload(secret, body)
    expect(verifySignature(secret, body.replace('1000', '1'), sig)).toBe(false)
    expect(verifySignature('outro', body, sig)).toBe(false)
    expect(verifySignature(secret, body, undefined)).toBe(false)
    expect(verifySignature(secret, body, 'zz')).toBe(false)
    expect(verifySignature(secret, body, sig.slice(0, 10))).toBe(false)
  })
})
