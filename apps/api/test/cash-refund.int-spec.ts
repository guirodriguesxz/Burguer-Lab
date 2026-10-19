import { NestExpressApplication } from '@nestjs/platform-express'
import { PrismaClient } from '@prisma/client'
import request from 'supertest'
import { PaymentsService } from '../src/payments/payments.service'
import { PixProvider } from '../src/payments/pix.provider'
import { signPayload } from '../src/payments/signature'
import { bearer, createApp, loginAs, resetDb, sleep } from './helpers'

describe('pagamento no caixa e estornos (integração)', () => {
  let app: NestExpressApplication
  let prisma: PrismaClient
  let admin: string
  let kitchen: string
  let cashier: string
  const refund = jest.fn()

  const api = () => request(app.getHttpServer())
  const order = (method: string, items: object[] = [{ productId: 'fries', qty: 1 }]) =>
    api().post('/api/orders').send({ mode: 'DINE_IN', method, items })
  const patch = (id: string, status: string, token: string) =>
    api().patch(`/api/orders/${id}/status`).set(bearer(token)).send({ status })
  const payPix = (txid: string, amountCents: number) => {
    const raw = JSON.stringify({ txid, status: 'PAID', amountCents })
    return api().post('/api/webhooks/pix').set('Content-Type', 'application/json').set('x-signature', signPayload('test-webhook-secret', raw)).send(raw)
  }
  const paymentOf = (orderId: string) => prisma.payment.findUniqueOrThrow({ where: { orderId } })
  const stock = async (id: string) => (await prisma.product.findUnique({ where: { id } }))!.stock

  beforeAll(async () => {
    prisma = new PrismaClient()
    app = await createApp((b) =>
      b.overrideProvider(PixProvider).useValue({
        createCharge: async ({ txid }: { txid: string }) => ({ payload: `pix-${txid}`, expiresAt: new Date(Date.now() + 300_000) }),
        refund,
        cancelCharge: async () => undefined,
      }),
    )
  })
  afterAll(async () => {
    await app.close()
    await prisma.$disconnect()
  })
  beforeEach(async () => {
    await resetDb(prisma)
    refund.mockReset().mockResolvedValue({ refundId: 'refund-1' })
    ;[admin, kitchen, cashier] = await Promise.all([loginAs(app, 'admin'), loginAs(app, 'kitchen'), loginAs(app, 'cashier')])
  })

  describe('pagamento no caixa (dinheiro)', () => {
    it('o pedido nasce pendente, o caixa o vê e confirma, e só então vai para a cozinha', async () => {
      const { body } = await order('CASH').expect(201)
      expect(body.status).toBe('CREATED')
      expect(body.payment).toMatchObject({ method: 'CASH', status: 'PENDING', amountCents: 1490 })
      expect(body.payment.txid).toBeNull()
      expect(new Date(body.payment.expiresAt).getTime()).toBeGreaterThan(Date.now())

      const pending = await api().get('/api/orders?status=CREATED').set(bearer(cashier)).expect(200)
      expect(pending.body.map((o: { id: string }) => o.id)).toEqual([body.id])
      expect((await api().get('/api/orders?status=PAID').set(bearer(kitchen)).expect(200)).body).toHaveLength(0)

      const confirmed = await api().post(`/api/orders/${body.id}/confirm-cash`).set(bearer(cashier)).expect(200)
      expect(confirmed.body.status).toBe('PAID')
      const payment = await paymentOf(body.id)
      expect(payment.status).toBe('PAID')
      expect(payment.confirmedById).toBeTruthy() // quem recebeu fica registrado
      expect((await api().get('/api/orders?status=PAID').set(bearer(kitchen)).expect(200)).body).toHaveLength(1)
    })

    it('confirmar duas vezes é recusado; só caixa e admin podem confirmar', async () => {
      const { body } = await order('CASH').expect(201)
      const url = `/api/orders/${body.id}/confirm-cash`
      await api().post(url).expect(401)
      await api().post(url).set(bearer(kitchen)).expect(403)
      await api().post(url).set(bearer(cashier)).expect(200)
      await api().post(url).set(bearer(cashier)).expect(409)
      await api().post(url).set(bearer(admin)).expect(409)
    })

    it('duas confirmações simultâneas: só uma vence', async () => {
      const { body } = await order('CASH').expect(201)
      const call = () => api().post(`/api/orders/${body.id}/confirm-cash`).set(bearer(cashier))
      const results = await Promise.all([call(), call()])
      expect(results.map((r) => r.status).sort()).toEqual([200, 409])
    })

    it('só aceita confirmação de pedido pago no caixa (não de cartão nem de Pix)', async () => {
      const card = (await order('CARD').expect(201)).body
      const pix = (await order('PIX').expect(201)).body
      await api().post(`/api/orders/${card.id}/confirm-cash`).set(bearer(cashier)).expect(404)
      await api().post(`/api/orders/${pix.id}/confirm-cash`).set(bearer(cashier)).expect(404)
    })

    it('não pago a tempo: expira, devolve o estoque e não pode mais ser confirmado', async () => {
      process.env.CASH_TTL_SECONDS = '1'
      let created
      try {
        created = (await order('CASH').expect(201)).body
      } finally {
        delete process.env.CASH_TTL_SECONDS
      }
      expect(await stock('fries')).toBe(4)

      await sleep(1200)
      expect(await app.get(PaymentsService).expirePending()).toBe(1)

      expect(await stock('fries')).toBe(5)
      expect((await prisma.order.findUnique({ where: { id: created.id } }))!.status).toBe('CANCELED')
      await api().post(`/api/orders/${created.id}/confirm-cash`).set(bearer(cashier)).expect(409)
    })

    it('o caixa só pode cancelar pedidos que aguardam pagamento', async () => {
      const pending = (await order('CASH').expect(201)).body
      const paid = (await order('CARD').expect(201)).body

      await patch(pending.id, 'PREPARING', cashier).expect(403) // caixa não mexe no preparo
      await patch(paid.id, 'CANCELED', cashier).expect(403) // nem cancela pedido já pago
      await patch(pending.id, 'CANCELED', cashier).expect(200)
      expect(await stock('fries')).toBe(4) // só o pedido pago permanece
    })

    it('pagamento no caixa pendente não entra no relatório', async () => {
      await order('CASH').expect(201)
      const res = await api().get('/api/admin/reports/summary?days=7').set(bearer(admin)).expect(200)
      expect(res.body).toMatchObject({ orders: 0, revenueCents: 0 })
    })
  })

  describe('estornos', () => {
    it('cancelar pedido pago no cartão estorna o pagamento', async () => {
      const { body } = await order('CARD').expect(201)
      const res = await patch(body.id, 'CANCELED', kitchen).expect(200)
      expect(res.body.status).toBe('CANCELED')
      expect(res.body.payment).toMatchObject({ status: 'REFUNDED', refundId: 'manual-card' })
      expect(refund).not.toHaveBeenCalled() // cartão/dinheiro são devolvidos manualmente
    })

    it('cancelar pedido Pix pago estorna pelo provedor, com o txid e o valor certos', async () => {
      const { body } = await order('PIX').expect(201)
      await payPix(body.payment.txid, body.totalCents).expect(200)

      const res = await patch(body.id, 'CANCELED', admin).expect(200)
      expect(refund).toHaveBeenCalledWith({ txid: body.payment.txid, providerRef: null, amountCents: 1490 })
      expect(res.body.payment).toMatchObject({ status: 'REFUNDED', refundId: 'refund-1' })
      expect(res.body.payment.refundedAt).toBeTruthy()
    })

    it('se o provedor recusar, fica REFUND_FAILED e o admin pode tentar de novo', async () => {
      const { body } = await order('PIX').expect(201)
      await payPix(body.payment.txid, body.totalCents).expect(200)

      refund.mockRejectedValueOnce(new Error('PSP indisponível'))
      const canceled = await patch(body.id, 'CANCELED', kitchen).expect(200)
      expect(canceled.body.status).toBe('CANCELED') // o cancelamento vale mesmo com o estorno pendente
      expect(canceled.body.payment).toMatchObject({ status: 'REFUND_FAILED', refundError: 'PSP indisponível' })

      await api().post(`/api/admin/orders/${body.id}/refund`).set(bearer(kitchen)).expect(403)
      const retry = await api().post(`/api/admin/orders/${body.id}/refund`).set(bearer(admin)).expect(200)
      expect(retry.body.payment).toMatchObject({ status: 'REFUNDED', refundId: 'refund-1', refundError: null })
      expect(refund).toHaveBeenCalledTimes(2)

      await api().post(`/api/admin/orders/${body.id}/refund`).set(bearer(admin)).expect(409) // já estornado
    })

    it('admin estorna um pedido em andamento: cancela, devolve estoque e estorna', async () => {
      const { body } = await order('CARD').expect(201)
      await patch(body.id, 'PREPARING', kitchen).expect(200)
      const res = await api().post(`/api/admin/orders/${body.id}/refund`).set(bearer(admin)).expect(200)
      expect(res.body).toMatchObject({ status: 'CANCELED', payment: { status: 'REFUNDED' } })
      expect(await stock('fries')).toBe(5)
    })

    it('pedido já entregue: estorna só o pagamento, sem devolver estoque, e sai do relatório', async () => {
      const { body } = await order('CARD').expect(201)
      for (const s of ['PREPARING', 'READY', 'DELIVERED']) await patch(body.id, s, kitchen).expect(200)

      const before = await api().get('/api/admin/reports/summary?days=7').set(bearer(admin)).expect(200)
      expect(before.body).toMatchObject({ orders: 1, revenueCents: 1490 })

      const res = await api().post(`/api/admin/orders/${body.id}/refund`).set(bearer(admin)).expect(200)
      expect(res.body).toMatchObject({ status: 'DELIVERED', payment: { status: 'REFUNDED' } })
      expect(await stock('fries')).toBe(4) // o lanche foi consumido: estoque não volta

      const after = await api().get('/api/admin/reports/summary?days=7').set(bearer(admin)).expect(200)
      expect(after.body).toMatchObject({ orders: 0, revenueCents: 0 })
    })

    it('não há o que estornar em pedido pendente ou inexistente', async () => {
      const { body } = await order('CASH').expect(201)
      await api().post(`/api/admin/orders/${body.id}/refund`).set(bearer(admin)).expect(409)
      await api().post('/api/admin/orders/nao-existe/refund').set(bearer(admin)).expect(404)
    })

    it('estornar dinheiro do caixa registra a devolução manual', async () => {
      const { body } = await order('CASH').expect(201)
      await api().post(`/api/orders/${body.id}/confirm-cash`).set(bearer(cashier)).expect(200)
      const res = await patch(body.id, 'CANCELED', admin).expect(200)
      expect(res.body.payment).toMatchObject({ status: 'REFUNDED', refundId: 'manual-cash' })
    })
  })
})
