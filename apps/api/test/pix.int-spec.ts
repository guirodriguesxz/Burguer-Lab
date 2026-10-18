import { NestExpressApplication } from '@nestjs/platform-express'
import { PrismaClient } from '@prisma/client'
import request from 'supertest'
import { PaymentsService } from '../src/payments/payments.service'
import { signPayload } from '../src/payments/signature'
import { bearer, createApp, loginAs, resetDb, sleep } from './helpers'

describe('Pix, webhook e expiração (integração)', () => {
  let app: NestExpressApplication
  let prisma: PrismaClient
  let kitchen: string

  const secret = 'test-webhook-secret'
  const createPix = (extra: object = {}) =>
    request(app.getHttpServer())
      .post('/api/orders')
      .send({ mode: 'DINE_IN', method: 'PIX', items: [{ productId: 'fries', qty: 1 }], ...extra })
      .expect(201)
  const webhook = (payload: object, signature?: string) => {
    const raw = JSON.stringify(payload)
    return request(app.getHttpServer())
      .post('/api/webhooks/pix')
      .set('Content-Type', 'application/json')
      .set('x-signature', signature ?? signPayload(secret, raw))
      .send(raw)
  }
  const kitchenOrders = async () =>
    (await request(app.getHttpServer()).get('/api/orders?status=PAID').set(bearer(kitchen)).expect(200)).body as { id: string }[]

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
    kitchen = await loginAs(app, 'kitchen')
  })

  it('pedido Pix nasce pendente e só chega à cozinha depois do webhook', async () => {
    const { body: order } = await createPix()
    expect(order.status).toBe('CREATED')
    expect(order.payment).toMatchObject({ method: 'PIX', status: 'PENDING', amountCents: 1490 })
    expect(order.payment.pixPayload).toContain(order.payment.txid)
    expect(await kitchenOrders()).toHaveLength(0)

    const res = await webhook({ txid: order.payment.txid, status: 'PAID', amountCents: 1490 }).expect(200)
    expect(res.body).toEqual({ ok: true, alreadyProcessed: false })

    const visible = await kitchenOrders()
    expect(visible.map((o) => o.id)).toEqual([order.id])
    const status = await request(app.getHttpServer()).get(`/api/orders/${order.id}/status`).expect(200)
    expect(status.body).toMatchObject({ status: 'PAID', paymentStatus: 'PAID' })
  })

  it('webhook: assinatura inválida, valor divergente e txid desconhecido são recusados', async () => {
    const { body: order } = await createPix()
    const txid = order.payment.txid

    await webhook({ txid, status: 'PAID', amountCents: 1490 }, 'deadbeef').expect(401)
    await webhook({ txid, status: 'PAID', amountCents: 1490 }, signPayload('segredo-errado', JSON.stringify({ txid, status: 'PAID', amountCents: 1490 }))).expect(401)
    await webhook({ txid, status: 'PAID', amountCents: 1 }).expect(400)
    await webhook({ txid: 'desconhecido', status: 'PAID', amountCents: 1490 }).expect(404)
    await webhook({ txid, status: 'REFUNDED', amountCents: 1490 }).expect(400)

    // nada disso confirmou o pedido
    expect((await prisma.payment.findUnique({ where: { txid } }))!.status).toBe('PENDING')
  })

  it('webhook é idempotente: reenvio não duplica nada', async () => {
    const { body: order } = await createPix()
    const payload = { txid: order.payment.txid, status: 'PAID', amountCents: 1490 }
    await webhook(payload).expect(200)
    const again = await webhook(payload).expect(200)
    expect(again.body.alreadyProcessed).toBe(true)

    const events = await prisma.orderEvent.findMany({ where: { orderId: order.id } })
    expect(events.filter((e) => e.to === 'PAID')).toHaveLength(1)
  })

  it('o simulador de desenvolvimento passa pelo mesmo caminho assinado', async () => {
    const { body: order } = await createPix()
    await request(app.getHttpServer()).post(`/api/dev/pix/${order.payment.txid}/pay`).expect(200)
    expect((await prisma.order.findUnique({ where: { id: order.id } }))!.status).toBe('PAID')
  })

  it('cobrança expirada cancela o pedido, devolve estoque e cupom, e recusa webhook tardio', async () => {
    process.env.PIX_TTL_SECONDS = '1'
    let order
    try {
      ;({ body: order } = await createPix({ couponCode: 'pct10' }))
    } finally {
      delete process.env.PIX_TTL_SECONDS
    }

    expect((await prisma.product.findUnique({ where: { id: 'fries' } }))!.stock).toBe(4)
    expect((await prisma.coupon.findUnique({ where: { code: 'PCT10' } }))!.usedCount).toBe(1)

    await sleep(1200)
    expect(await app.get(PaymentsService).expirePending()).toBe(1)

    expect((await prisma.order.findUnique({ where: { id: order.id } }))!.status).toBe('CANCELED')
    expect((await prisma.payment.findUnique({ where: { txid: order.payment.txid } }))!.status).toBe('EXPIRED')
    expect((await prisma.product.findUnique({ where: { id: 'fries' } }))!.stock).toBe(5)
    expect((await prisma.coupon.findUnique({ where: { code: 'PCT10' } }))!.usedCount).toBe(0)

    await webhook({ txid: order.payment.txid, status: 'PAID', amountCents: order.totalCents }).expect(409)
    expect(await kitchenOrders()).toHaveLength(0)
  })

  it('cobrança ainda válida não expira', async () => {
    await createPix()
    expect(await app.get(PaymentsService).expirePending()).toBe(0)
  })
})
