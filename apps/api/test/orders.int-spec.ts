import { NestExpressApplication } from '@nestjs/platform-express'
import { PrismaClient } from '@prisma/client'
import request from 'supertest'
import { bearer, createApp, loginAs, resetDb } from './helpers'

describe('pedidos (integração)', () => {
  let app: NestExpressApplication
  let prisma: PrismaClient
  let kitchen: string

  const post = (body: object, headers: Record<string, string> = {}) =>
    request(app.getHttpServer()).post('/api/orders').set(headers).send(body)

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

  it('calcula o preço no servidor (adicionais incluídos) e baixa o estoque', async () => {
    const res = await post({
      mode: 'DINE_IN',
      method: 'CARD',
      items: [{ productId: 'classic', qty: 2, extraIds: ['classic-bacon'], removed: ['Cebola'] }],
    }).expect(201)

    expect(res.body.status).toBe('PAID')
    expect(res.body.totalCents).toBe(2 * (2490 + 400))
    expect(res.body.items[0]).toMatchObject({ productName: 'Clássico', qty: 2, unitPriceCents: 2890, removed: ['Cebola'] })
    expect((await prisma.product.findUnique({ where: { id: 'classic' } }))!.stock).toBe(8)
  })

  it('ignora preço enviado pelo cliente', async () => {
    const res = await post({
      mode: 'TAKEAWAY',
      method: 'CARD',
      totalCents: 1,
      items: [{ productId: 'fries', qty: 1, unitPriceCents: 1 }],
    }).expect(201)
    expect(res.body.totalCents).toBe(1490)
  })

  it('rejeita produto pausado, adicional inválido, entrada malformada e quantidade absurda', async () => {
    const base = { mode: 'DINE_IN', method: 'CARD' }
    await post({ ...base, items: [{ productId: 'paused', qty: 1 }] }).expect(409)
    await post({ ...base, items: [{ productId: 'classic', qty: 1, extraIds: ['nao-existe'] }] }).expect(400)
    await post({ ...base, items: [{ productId: 'ghost', qty: 1 }] }).expect(400)
    await post({ ...base, items: [] }).expect(400)
    await post({ ...base, items: [{ productId: 'classic', qty: 999 }] }).expect(400)
    await post({ mode: 'NADA', method: 'CARD', items: [{ productId: 'classic', qty: 1 }] }).expect(400)
  })

  it('estoque insuficiente falha sem alterar nada (rollback)', async () => {
    await post({
      mode: 'DINE_IN',
      method: 'CARD',
      items: [
        { productId: 'classic', qty: 1 },
        { productId: 'brownie', qty: 2 }, // só há 1
      ],
    }).expect(409)

    expect((await prisma.product.findUnique({ where: { id: 'classic' } }))!.stock).toBe(10)
    expect((await prisma.product.findUnique({ where: { id: 'brownie' } }))!.stock).toBe(1)
    expect(await prisma.order.count()).toBe(0)
  })

  it('dois pedidos disputando a última unidade: só um vence', async () => {
    const body = { mode: 'DINE_IN', method: 'CARD', items: [{ productId: 'brownie', qty: 1 }] }
    const results = await Promise.all([post(body), post(body)])
    expect(results.map((r) => r.status).sort()).toEqual([201, 409])
    expect((await prisma.product.findUnique({ where: { id: 'brownie' } }))!.stock).toBe(0)
  })

  it('Idempotency-Key repetida devolve o mesmo pedido, sem duplicar nem baixar estoque de novo', async () => {
    const body = { mode: 'DINE_IN', method: 'CARD', items: [{ productId: 'fries', qty: 1 }] }
    const a = await post(body, { 'Idempotency-Key': 'k-1' }).expect(201)
    const b = await post(body, { 'Idempotency-Key': 'k-1' }).expect(201)
    expect(b.body.id).toBe(a.body.id)
    expect(await prisma.order.count()).toBe(1)
    expect((await prisma.product.findUnique({ where: { id: 'fries' } }))!.stock).toBe(4)
  })

  it('percorre a máquina de estados e bloqueia transições inválidas', async () => {
    const { body: order } = await post({ mode: 'DINE_IN', method: 'CARD', items: [{ productId: 'cola', qty: 1 }] }).expect(201)
    const move = (status: string) =>
      request(app.getHttpServer()).patch(`/api/orders/${order.id}/status`).set(bearer(kitchen)).send({ status })

    await move('READY').expect(409) // não pode pular o preparo
    await move('PREPARING').expect(200)
    await move('READY').expect(200)
    await move('CANCELED').expect(409) // pronto não cancela
    await move('DELIVERED').expect(200)
    await move('PREPARING').expect(409) // estado final

    const events = await prisma.orderEvent.findMany({ where: { orderId: order.id }, orderBy: { createdAt: 'asc' } })
    expect(events.map((e) => e.to)).toEqual(['CREATED', 'PAID', 'PREPARING', 'READY', 'DELIVERED'])
  })

  it('listagem e mudança de status exigem autenticação', async () => {
    await request(app.getHttpServer()).get('/api/orders').expect(401)
    await request(app.getHttpServer()).patch('/api/orders/x/status').send({ status: 'PREPARING' }).expect(401)
    await request(app.getHttpServer()).get('/api/orders').set(bearer(kitchen)).expect(200)
  })

  it('o status público não expõe itens nem valores', async () => {
    const { body: order } = await post({ mode: 'DINE_IN', method: 'CARD', items: [{ productId: 'cola', qty: 1 }] }).expect(201)
    const res = await request(app.getHttpServer()).get(`/api/orders/${order.id}/status`).expect(200)
    expect(Object.keys(res.body).sort()).toEqual(['expiresAt', 'id', 'number', 'paymentStatus', 'status'])
  })
})
