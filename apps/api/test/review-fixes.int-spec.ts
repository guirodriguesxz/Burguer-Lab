import { NestExpressApplication } from '@nestjs/platform-express'
import { PrismaClient } from '@prisma/client'
import request from 'supertest'
import { signPayload } from '../src/payments/signature'
import { bearer, createApp, loginAs, resetDb } from './helpers'

/** Regressões das falhas de lógica e segurança encontradas na revisão do projeto. */
describe('correções da revisão (integração)', () => {
  let app: NestExpressApplication
  let prisma: PrismaClient
  let kitchen: string
  let admin: string

  const api = () => request(app.getHttpServer())
  const order = (body: object) => api().post('/api/orders').send({ mode: 'DINE_IN', ...body })
  const move = (id: string, status: string, token = kitchen) =>
    api().patch(`/api/orders/${id}/status`).set(bearer(token)).send({ status })
  const stock = async (id: string) => (await prisma.product.findUnique({ where: { id } }))!.stock

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
    admin = await loginAs(app, 'admin')
  })

  describe('lógica', () => {
    it('cancelar um pedido devolve estoque e uso do cupom', async () => {
      const { body } = await order({ method: 'CARD', couponCode: 'PCT10', items: [{ productId: 'classic', qty: 2 }] }).expect(201)
      expect(await stock('classic')).toBe(8)
      expect((await prisma.coupon.findUnique({ where: { code: 'PCT10' } }))!.usedCount).toBe(1)

      await move(body.id, 'CANCELED').expect(200)

      expect(await stock('classic')).toBe(10)
      expect((await prisma.coupon.findUnique({ where: { code: 'PCT10' } }))!.usedCount).toBe(0)
      const events = await prisma.orderEvent.findMany({ where: { orderId: body.id }, orderBy: { createdAt: 'asc' } })
      expect(events.at(-1)).toMatchObject({ from: 'PAID', to: 'CANCELED' })
    })

    it('cancelar não devolve estoque duas vezes (cancelamento repetido é recusado)', async () => {
      const { body } = await order({ method: 'CARD', items: [{ productId: 'fries', qty: 1 }] }).expect(201)
      await move(body.id, 'CANCELED').expect(200)
      await move(body.id, 'CANCELED').expect(409)
      expect(await stock('fries')).toBe(5)
    })

    it('duas telas movendo o mesmo pedido ao mesmo tempo: só uma vence', async () => {
      const { body } = await order({ method: 'CARD', items: [{ productId: 'cola', qty: 1 }] }).expect(201)
      const results = await Promise.all([move(body.id, 'PREPARING'), move(body.id, 'PREPARING')])
      expect(results.map((r) => r.status).sort()).toEqual([200, 409])
    })

    it('Pix cancelado antes de pagar: cobrança deixa de valer e o webhook tardio não ressuscita o pedido', async () => {
      const { body } = await order({ method: 'PIX', items: [{ productId: 'fries', qty: 1 }] }).expect(201)
      await move(body.id, 'CANCELED', admin).expect(200)
      expect(await stock('fries')).toBe(5)

      const raw = JSON.stringify({ txid: body.payment.txid, status: 'PAID', amountCents: body.totalCents })
      await api()
        .post('/api/webhooks/pix')
        .set('Content-Type', 'application/json')
        .set('x-signature', signPayload('test-webhook-secret', raw))
        .send(raw)
        .expect(409)
      expect((await prisma.order.findUnique({ where: { id: body.id } }))!.status).toBe('CANCELED')
    })

    it('o relatório só conta pedidos pagos (Pix pendente e cancelados ficam de fora)', async () => {
      await order({ method: 'CARD', items: [{ productId: 'fries', qty: 1 }] }).expect(201) // pago: 14,90
      await order({ method: 'PIX', items: [{ productId: 'classic', qty: 1 }] }).expect(201) // pendente
      const { body: canceled } = await order({ method: 'CARD', items: [{ productId: 'cola', qty: 1 }] }).expect(201)
      await move(canceled.id, 'CANCELED').expect(200)

      const res = await api().get('/api/admin/reports/summary?days=7').set(bearer(admin)).expect(200)
      expect(res.body).toMatchObject({ orders: 1, revenueCents: 1490, avgTicketCents: 1490 })
      expect(res.body.byDay.reduce((s: number, d: { orders: number }) => s + d.orders, 0)).toBe(1)
      expect(res.body.topProducts.map((p: { name: string }) => p.name)).toEqual(['Batata'])
    })

    it('só aceita remover ingredientes que o produto permite', async () => {
      await order({ method: 'CARD', items: [{ productId: 'classic', qty: 1, removed: ['Cebola'] }] }).expect(201)
      await order({ method: 'CARD', items: [{ productId: 'classic', qty: 1, removed: ['Qualquer coisa'] }] }).expect(400)
      await order({ method: 'CARD', items: [{ productId: 'cola', qty: 1, removed: ['Gelo'] }] }).expect(400)
    })

    it('código offline repetido não derruba o pedido (colisão de código curto)', async () => {
      const body = { method: 'CARD', clientRef: 'AB12', items: [{ productId: 'cola', qty: 1 }] }
      await order(body).expect(201)
      await order(body).expect(201)
      expect(await prisma.order.count({ where: { clientRef: 'AB12' } })).toBe(2)
    })
  })

  describe('segurança', () => {
    it('valida o filtro de status e os tamanhos de entrada', async () => {
      await api().get('/api/orders?status=INVALIDO').set(bearer(kitchen)).expect(400)
      await api().get('/api/orders?status=PAID,READY').set(bearer(kitchen)).expect(200)

      const many = Array.from({ length: 31 }, () => ({ productId: 'cola', qty: 1 }))
      await order({ method: 'CARD', items: many }).expect(400)
      await order({ method: 'CARD', clientRef: 'tem espaço!', items: [{ productId: 'cola', qty: 1 }] }).expect(400)
      await order({ method: 'CARD', items: [{ productId: 'classic', qty: 1, removed: Array(11).fill('Cebola') }] }).expect(400)
    })

    it('o papel vale o do banco: promover/rebaixar/excluir usuário reflete no mesmo token', async () => {
      await api().get('/api/admin/products').set(bearer(kitchen)).expect(403)

      await prisma.user.update({ where: { email: 'kitchen@test.dev' }, data: { role: 'ADMIN' } })
      await api().get('/api/admin/products').set(bearer(kitchen)).expect(200) // promovido: vale na hora

      await prisma.user.update({ where: { email: 'kitchen@test.dev' }, data: { role: 'KITCHEN' } })
      await api().get('/api/admin/products').set(bearer(kitchen)).expect(403) // rebaixado

      await prisma.user.delete({ where: { email: 'kitchen@test.dev' } })
      await api().get('/api/orders').set(bearer(kitchen)).expect(401) // excluído: sessão cai
    })

    it('token com versão antiga (senha trocada) é recusado', async () => {
      await prisma.user.update({ where: { email: 'admin@test.dev' }, data: { tokenVersion: { increment: 1 } } })
      await api().get('/api/admin/products').set(bearer(admin)).expect(401)
    })

    it('upsell ignora listas gigantes de produtos sem estourar', async () => {
      const ids = Array.from({ length: 500 }, (_, i) => `x${i}`).join(',')
      await api().get(`/api/menu/upsell?productIds=${ids}`).expect(200)
    })
  })
})
