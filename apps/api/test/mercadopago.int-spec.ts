// Antes de a aplicação ser carregada: escolhe o provedor Mercado Pago e define as credenciais de teste.
process.env.PIX_PROVIDER = 'mercadopago'
process.env.MP_ACCESS_TOKEN = 'TEST-token'
process.env.PUBLIC_API_URL = 'https://loja.test'
process.env.MP_WEBHOOK_SECRET = 'mp-secret'

import { NestExpressApplication } from '@nestjs/platform-express'
import { PrismaClient } from '@prisma/client'
import request from 'supertest'
import { PaymentsService } from '../src/payments/payments.service'
import { signMercadoPago } from '../src/payments/mercadopago-signature'
import { bearer, createApp, loginAs, resetDb, sleep } from './helpers'

interface MpPayment {
  id: number
  status: string
  external_reference: string
  transaction_amount: number
}

describe('Pix via Mercado Pago (integração, API do provedor simulada)', () => {
  let app: NestExpressApplication
  let prisma: PrismaClient
  let kitchen: string
  let admin: string
  let fetchSpy: jest.SpyInstance
  let mp: Map<number, MpPayment>
  let calls: { method: string; path: string; body?: any; headers: Record<string, string> }[]
  let seq: number
  let refundFails: boolean

  const reply = (status: number, body: unknown) => Promise.resolve({ ok: status < 300, status, json: async () => body } as Response)

  /** Simula os endpoints do Mercado Pago usados pelo provedor. */
  const mockMercadoPago = (url: string, init: RequestInit) => {
    const path = new URL(url).pathname
    const method = init.method ?? 'GET'
    const body = init.body ? JSON.parse(String(init.body)) : undefined
    calls.push({ method, path, body, headers: init.headers as Record<string, string> })

    if (method === 'POST' && path === '/v1/payments') {
      const id = ++seq
      mp.set(id, { id, status: 'pending', external_reference: body.external_reference, transaction_amount: body.transaction_amount })
      return reply(201, { id, status: 'pending', point_of_interaction: { transaction_data: { qr_code: `MPQR-${id}` } } })
    }
    const refund = path.match(/^\/v1\/payments\/(\d+)\/refunds$/)
    if (method === 'POST' && refund) return refundFails ? reply(400, { message: 'saldo insuficiente' }) : reply(201, { id: 555, status: 'approved' })
    const one = path.match(/^\/v1\/payments\/(\d+)$/)
    if (one && method === 'GET') {
      const p = mp.get(Number(one[1]))
      return p ? reply(200, p) : reply(404, { message: 'not found' })
    }
    if (one && method === 'PUT') {
      const p = mp.get(Number(one[1]))
      if (p) p.status = body.status
      return reply(200, p ?? {})
    }
    return reply(404, { message: 'rota desconhecida no mock' })
  }

  const api = () => request(app.getHttpServer())
  const createPix = (items: object[] = [{ productId: 'fries', qty: 1 }]) =>
    api().post('/api/orders').send({ mode: 'DINE_IN', method: 'PIX', items }).expect(201)
  const approve = (id: number) => (mp.get(id)!.status = 'approved')

  const notify = (dataId: string | number, opts: { type?: string; signature?: string | null; requestId?: string; ts?: number } = {}) => {
    const requestId = opts.requestId ?? `req-${Math.random().toString(36).slice(2)}`
    const sig = opts.signature === undefined ? signMercadoPago('mp-secret', String(dataId), requestId, opts.ts) : opts.signature
    const req = api()
      .post(`/api/webhooks/mercadopago?data.id=${dataId}&type=${opts.type ?? 'payment'}`)
      .set('x-request-id', requestId)
      .send({ type: opts.type ?? 'payment', data: { id: String(dataId) } })
    return sig === null ? req : req.set('x-signature', sig)
  }

  const callsTo = (method: string, pattern: RegExp) => calls.filter((c) => c.method === method && pattern.test(c.path))

  beforeAll(async () => {
    prisma = new PrismaClient()
    app = await createApp()
  })
  afterAll(async () => {
    await app.close()
    await prisma.$disconnect()
  })
  beforeEach(async () => {
    await resetDb(prisma)
    mp = new Map()
    calls = []
    seq = 9000
    refundFails = false
    fetchSpy = jest.spyOn(global, 'fetch').mockImplementation((url, init) => mockMercadoPago(String(url), init ?? {}))
    ;[kitchen, admin] = await Promise.all([loginAs(app, 'kitchen'), loginAs(app, 'admin')])
  })
  afterEach(() => fetchSpy.mockRestore())

  it('cria a cobrança no Mercado Pago e guarda a referência do pagamento', async () => {
    const { body } = await createPix()
    expect(body.payment).toMatchObject({ method: 'PIX', status: 'PENDING', pixPayload: 'MPQR-9001', providerRef: '9001' })

    const create = callsTo('POST', /^\/v1\/payments$/)[0]
    expect(create.headers['X-Idempotency-Key']).toBe(body.payment.txid)
    expect(create.body).toMatchObject({ transaction_amount: 14.9, payment_method_id: 'pix', external_reference: body.payment.txid })
    expect(create.body.notification_url).toBe('https://loja.test/api/webhooks/mercadopago')
  })

  it('webhook sem assinatura, com assinatura errada ou antigo é recusado e nada é consultado', async () => {
    const { body } = await createPix()
    approve(9001)

    await notify(9001, { signature: null }).expect(401)
    await notify(9001, { signature: 'ts=1,v1=deadbeef' }).expect(401)
    await notify(9001, { ts: Date.now() - 60 * 60 * 1000 }).expect(401) // reenvio antigo
    await notify(9001, { signature: signMercadoPago('segredo-errado', '9001', 'r1'), requestId: 'r1' }).expect(401)

    expect(callsTo('GET', /^\/v1\/payments\/9001$/)).toHaveLength(0)
    expect((await prisma.payment.findUnique({ where: { txid: body.payment.txid } }))!.status).toBe('PENDING')
  })

  it('confirma só depois de consultar o provedor: aviso com pagamento ainda pendente não confirma', async () => {
    const { body } = await createPix()

    const pending = await notify(9001).expect(200)
    expect(pending.body).toMatchObject({ status: 'pending' })
    expect((await prisma.payment.findUnique({ where: { txid: body.payment.txid } }))!.status).toBe('PENDING')

    approve(9001)
    const paid = await notify(9001).expect(200)
    expect(paid.body).toEqual({ ok: true, alreadyProcessed: false })
    expect((await prisma.order.findUnique({ where: { id: body.id } }))!.status).toBe('PAID')
    const list = await api().get('/api/orders?status=PAID').set(bearer(kitchen)).expect(200)
    expect(list.body.map((o: { id: string }) => o.id)).toEqual([body.id])

    expect((await notify(9001).expect(200)).body.alreadyProcessed).toBe(true) // reenvio é inofensivo
  })

  it('pagamento alheio com a mesma referência não confirma o pedido (id do provedor precisa conferir)', async () => {
    const { body } = await createPix()
    // o atacante cria um pagamento APROVADO na mesma conta, copiando a external_reference do pedido
    mp.set(9999, { id: 9999, status: 'approved', external_reference: body.payment.txid, transaction_amount: 14.9 })

    await notify(9999).expect(404)
    expect((await prisma.order.findUnique({ where: { id: body.id } }))!.status).toBe('CREATED')
  })

  it('valor aprovado diferente do cobrado não confirma', async () => {
    const { body } = await createPix()
    approve(9001)
    mp.get(9001)!.transaction_amount = 0.01

    await notify(9001).expect(400)
    expect((await prisma.payment.findUnique({ where: { txid: body.payment.txid } }))!.status).toBe('PENDING')
  })

  it('eventos que não são de pagamento são reconhecidos e ignorados', async () => {
    await createPix()
    const res = await notify(9001, { type: 'merchant_order' }).expect(200)
    expect(res.body).toEqual({ ok: true, ignored: true })
    expect(callsTo('GET', /\/v1\/payments\//)).toHaveLength(0)
  })

  it('pedido expirado cancela a cobrança no provedor; se mesmo assim pagarem, o valor é estornado', async () => {
    process.env.PIX_TTL_SECONDS = '1'
    let created
    try {
      created = (await createPix()).body
    } finally {
      delete process.env.PIX_TTL_SECONDS
    }
    await sleep(1200)
    expect(await app.get(PaymentsService).expirePending()).toBe(1)

    const cancel = callsTo('PUT', /^\/v1\/payments\/9001$/)
    expect(cancel).toHaveLength(1)
    expect(cancel[0].body).toEqual({ status: 'cancelled' })

    // o cliente conseguiu pagar antes de a baixa chegar ao banco: pagamento tardio
    approve(9001)
    await notify(9001).expect(200)

    const refunds = callsTo('POST', /^\/v1\/payments\/9001\/refunds$/)
    expect(refunds).toHaveLength(1)
    expect(refunds[0].body).toEqual({ amount: 14.9 })
    expect((await prisma.order.findUnique({ where: { id: created.id } }))!.status).toBe('CANCELED') // não ressuscita
    expect(await prisma.payment.findUnique({ where: { orderId: created.id } })).toMatchObject({ status: 'REFUNDED', refundId: '555' })
    const forKitchen = await api().get('/api/orders?status=PAID,PREPARING').set(bearer(kitchen)).expect(200)
    expect(forKitchen.body).toHaveLength(0)
  })

  it('cancelar um Pix pendente cancela a cobrança no provedor', async () => {
    const { body } = await createPix()
    await api().patch(`/api/orders/${body.id}/status`).set(bearer(admin)).send({ status: 'CANCELED' }).expect(200)
    expect(callsTo('PUT', /^\/v1\/payments\/9001$/)).toHaveLength(1)
  })

  it('cancelar um pedido pago estorna pelo Mercado Pago; se falhar, o admin tenta de novo', async () => {
    const { body } = await createPix()
    approve(9001)
    await notify(9001).expect(200)

    refundFails = true
    const canceled = await api().patch(`/api/orders/${body.id}/status`).set(bearer(kitchen)).send({ status: 'CANCELED' }).expect(200)
    expect(canceled.body.payment).toMatchObject({ status: 'REFUND_FAILED', refundError: expect.stringContaining('saldo insuficiente') })

    refundFails = false
    const retry = await api().post(`/api/admin/orders/${body.id}/refund`).set(bearer(admin)).expect(200)
    expect(retry.body.payment).toMatchObject({ status: 'REFUNDED', refundId: '555' })
    const refunds = callsTo('POST', /^\/v1\/payments\/9001\/refunds$/)
    expect(refunds).toHaveLength(2)
    expect(refunds[1].body).toEqual({ amount: 14.9 })
  })

  it('não inicia sem o segredo do webhook (não dá para validar assinaturas sem ele)', async () => {
    const secret = process.env.MP_WEBHOOK_SECRET
    delete process.env.MP_WEBHOOK_SECRET
    try {
      await expect(createApp()).rejects.toThrow('MP_WEBHOOK_SECRET')
    } finally {
      process.env.MP_WEBHOOK_SECRET = secret
    }
  })
})
