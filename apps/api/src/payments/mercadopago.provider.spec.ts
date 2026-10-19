import { MercadoPagoPixProvider } from './mercadopago.provider'

/** O provedor é testado contra respostas simuladas, no formato descrito na documentação do Mercado Pago. */
describe('MercadoPagoPixProvider', () => {
  const provider = new MercadoPagoPixProvider({
    accessToken: 'APP_USR-token',
    publicApiUrl: 'https://loja.exemplo.com/',
    payerEmail: 'cliente@loja.com',
  })

  let fetchMock: jest.SpyInstance
  const json = (status: number, body: unknown) =>
    Promise.resolve({ ok: status >= 200 && status < 300, status, json: async () => body } as Response)
  const lastCall = () => {
    const [url, init] = fetchMock.mock.calls.at(-1)!
    return { url: String(url), init: init as RequestInit, body: init?.body ? JSON.parse(String(init.body)) : undefined, headers: init.headers as Record<string, string> }
  }

  beforeEach(() => {
    fetchMock = jest.spyOn(global, 'fetch')
  })
  afterEach(() => {
    fetchMock.mockRestore()
    delete process.env.PIX_TTL_SECONDS
  })

  describe('createCharge', () => {
    it('envia a cobrança no formato da API e devolve o código Pix e a referência', async () => {
      fetchMock.mockReturnValue(json(201, { id: 5466310457, status: 'pending', point_of_interaction: { transaction_data: { qr_code: '00020126PIX', qr_code_base64: 'abc' } } }))

      const charge = await provider.createCharge({ txid: 'abc123', amountCents: 2490 })

      const { url, init, body, headers } = lastCall()
      expect(url).toBe('https://api.mercadopago.com/v1/payments')
      expect(init.method).toBe('POST')
      expect(headers.Authorization).toBe('Bearer APP_USR-token')
      expect(headers['X-Idempotency-Key']).toBe('abc123') // reenviar não duplica a cobrança
      expect(body).toMatchObject({
        transaction_amount: 24.9,
        payment_method_id: 'pix',
        external_reference: 'abc123',
        notification_url: 'https://loja.exemplo.com/api/webhooks/mercadopago',
        payer: { email: 'cliente@loja.com' },
      })
      expect(charge).toMatchObject({ payload: '00020126PIX', providerRef: '5466310457' })
    })

    it('respeita o mínimo de 30 min do provedor, mas o pedido expira no prazo local', async () => {
      fetchMock.mockReturnValue(json(201, { id: 1, point_of_interaction: { transaction_data: { qr_code: 'x' } } }))
      process.env.PIX_TTL_SECONDS = '300'

      const before = Date.now()
      const charge = await provider.createCharge({ txid: 't', amountCents: 100 })

      const providerExpiry = new Date(lastCall().body.date_of_expiration).getTime()
      expect(providerExpiry - before).toBeGreaterThanOrEqual(30 * 60 * 1000)
      expect(lastCall().body.date_of_expiration).toMatch(/\+00:00$/)
      expect(charge.expiresAt.getTime() - before).toBeLessThan(6 * 60 * 1000) // 5 min locais
    })

    it('falha com mensagem clara se o provedor recusar ou não devolver o código Pix', async () => {
      fetchMock.mockReturnValueOnce(json(400, { message: 'invalid payer email', cause: [{ data: 'segredo' }] }))
      await expect(provider.createCharge({ txid: 't', amountCents: 100 })).rejects.toThrow('Mercado Pago respondeu 400: invalid payer email')

      fetchMock.mockReturnValueOnce(json(201, { id: 1, point_of_interaction: {} }))
      await expect(provider.createCharge({ txid: 't', amountCents: 100 })).rejects.toThrow('não devolveu o código Pix')
    })
  })

  describe('refund', () => {
    it('estorna o valor pelo id do pagamento, com chave de idempotência', async () => {
      fetchMock.mockReturnValue(json(201, { id: 777, status: 'approved' }))

      const res = await provider.refund({ txid: 'abc123', providerRef: '5466310457', amountCents: 2490 })

      const { url, body, headers } = lastCall()
      expect(url).toBe('https://api.mercadopago.com/v1/payments/5466310457/refunds')
      expect(body).toEqual({ amount: 24.9 })
      expect(headers['X-Idempotency-Key']).toBe('refund-abc123')
      expect(headers['X-Render-In-Process-Refunds']).toBe('true')
      expect(res).toEqual({ refundId: '777' })
    })

    it('recusa estornar sem a referência do provedor e propaga erro do provedor', async () => {
      await expect(provider.refund({ txid: 't', providerRef: null, amountCents: 100 })).rejects.toThrow('sem referência')
      fetchMock.mockReturnValueOnce(json(400, { message: 'insufficient funds' }))
      await expect(provider.refund({ txid: 't', providerRef: '1', amountCents: 100 })).rejects.toThrow('insufficient funds')
    })
  })

  describe('cancelCharge e getPayment', () => {
    it('cancela a cobrança pendente e nunca lança (melhor esforço)', async () => {
      fetchMock.mockReturnValueOnce(json(200, { id: 1, status: 'cancelled' }))
      await provider.cancelCharge({ txid: 't', providerRef: '1', amountCents: 100 })
      expect(lastCall().url).toBe('https://api.mercadopago.com/v1/payments/1')
      expect(lastCall().init.method).toBe('PUT')
      expect(lastCall().body).toEqual({ status: 'cancelled' })

      fetchMock.mockReturnValueOnce(json(500, {}))
      await expect(provider.cancelCharge({ txid: 't', providerRef: '1', amountCents: 100 })).resolves.toBeUndefined()
      fetchMock.mockRejectedValueOnce(new Error('rede'))
      await expect(provider.cancelCharge({ txid: 't', providerRef: '1', amountCents: 100 })).resolves.toBeUndefined()

      fetchMock.mockClear()
      await provider.cancelCharge({ txid: 't', providerRef: null, amountCents: 100 }) // sem referência: nada a fazer
      expect(fetchMock).not.toHaveBeenCalled()
    })

    it('consulta o pagamento pelo id', async () => {
      fetchMock.mockReturnValue(json(200, { id: 5, status: 'approved', external_reference: 'abc', transaction_amount: 24.9 }))
      const p = await provider.getPayment('5')
      expect(lastCall().url).toBe('https://api.mercadopago.com/v1/payments/5')
      expect(p).toMatchObject({ status: 'approved', external_reference: 'abc' })
    })
  })
})
