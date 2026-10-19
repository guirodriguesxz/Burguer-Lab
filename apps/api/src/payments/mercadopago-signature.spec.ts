import { createHmac } from 'node:crypto'
import { MP_TIMESTAMP_TOLERANCE_MS, signMercadoPago, verifyMercadoPagoSignature } from './mercadopago-signature'

describe('assinatura de webhook do Mercado Pago', () => {
  const secret = 'segredo-do-painel'
  const now = 1_700_000_000_000
  const base = { secret, requestId: 'req-123', dataId: '98765', now }

  it('aceita uma assinatura válida', () => {
    const header = signMercadoPago(secret, '98765', 'req-123', now)
    expect(verifyMercadoPagoSignature({ ...base, signatureHeader: header })).toBe(true)
  })

  it('segue exatamente o formato da documentação (manifest id;request-id;ts)', () => {
    const manifest = `id:98765;request-id:req-123;ts:${now};`
    const v1 = createHmac('sha256', secret).update(manifest).digest('hex')
    expect(verifyMercadoPagoSignature({ ...base, signatureHeader: `ts=${now},v1=${v1}` })).toBe(true)
    expect(verifyMercadoPagoSignature({ ...base, signatureHeader: `v1=${v1}, ts=${now}` })).toBe(true) // ordem e espaços
  })

  it('o data.id alfanumérico é comparado em minúsculas', () => {
    const header = signMercadoPago(secret, 'ABC123', 'req-123', now) // assinado com o id em minúsculas
    expect(verifyMercadoPagoSignature({ ...base, dataId: 'ABC123', signatureHeader: header })).toBe(true)
  })

  it('recusa segredo errado, id ou request-id trocados e valores adulterados', () => {
    const header = signMercadoPago(secret, '98765', 'req-123', now)
    expect(verifyMercadoPagoSignature({ ...base, secret: 'outro', signatureHeader: header })).toBe(false)
    expect(verifyMercadoPagoSignature({ ...base, dataId: '11111', signatureHeader: header })).toBe(false)
    expect(verifyMercadoPagoSignature({ ...base, requestId: 'req-999', signatureHeader: header })).toBe(false)
    expect(verifyMercadoPagoSignature({ ...base, signatureHeader: header.replace(/v1=./, 'v1=0') })).toBe(false)
  })

  it('recusa cabeçalho ausente, incompleto ou malformado', () => {
    expect(verifyMercadoPagoSignature({ ...base, signatureHeader: undefined })).toBe(false)
    expect(verifyMercadoPagoSignature({ ...base, signatureHeader: '' })).toBe(false)
    expect(verifyMercadoPagoSignature({ ...base, signatureHeader: `ts=${now}` })).toBe(false)
    expect(verifyMercadoPagoSignature({ ...base, signatureHeader: 'v1=abc' })).toBe(false)
    expect(verifyMercadoPagoSignature({ ...base, signatureHeader: `ts=abc,v1=zz` })).toBe(false)
    expect(verifyMercadoPagoSignature({ ...base, requestId: undefined, signatureHeader: signMercadoPago(secret, '98765', 'req-123', now) })).toBe(false)
    expect(verifyMercadoPagoSignature({ ...base, dataId: undefined, signatureHeader: signMercadoPago(secret, '98765', 'req-123', now) })).toBe(false)
  })

  it('recusa notificação antiga demais ou do futuro (reenvio)', () => {
    const old = now - MP_TIMESTAMP_TOLERANCE_MS - 1000
    expect(verifyMercadoPagoSignature({ ...base, signatureHeader: signMercadoPago(secret, '98765', 'req-123', old) })).toBe(false)
    const future = now + MP_TIMESTAMP_TOLERANCE_MS + 1000
    expect(verifyMercadoPagoSignature({ ...base, signatureHeader: signMercadoPago(secret, '98765', 'req-123', future) })).toBe(false)
    const almost = now - MP_TIMESTAMP_TOLERANCE_MS + 1000
    expect(verifyMercadoPagoSignature({ ...base, signatureHeader: signMercadoPago(secret, '98765', 'req-123', almost) })).toBe(true)
  })
})
