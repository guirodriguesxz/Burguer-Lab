import { NestExpressApplication } from '@nestjs/platform-express'
import { PrismaClient } from '@prisma/client'
import request from 'supertest'
import { bearer, createApp, loginAs, resetDb } from './helpers'

describe('senha diária e fila de senhas (integração)', () => {
  let app: NestExpressApplication
  let prisma: PrismaClient
  let kitchen: string

  const api = () => request(app.getHttpServer())
  const order = (method = 'CARD', items: object[] = [{ productId: 'cola', qty: 1 }]) =>
    api().post('/api/orders').send({ mode: 'DINE_IN', method, items })
  const move = (id: string, status: string) => api().patch(`/api/orders/${id}/status`).set(bearer(kitchen)).send({ status })
  const queue = async () => (await api().get('/api/queue').expect(200)).body as { preparing: number[]; ready: number[] }

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

  describe('senha diária', () => {
    it('começa em 1 e segue em sequência', async () => {
      const tickets: number[] = []
      for (let i = 0; i < 3; i++) tickets.push((await order().expect(201)).body.ticket)
      expect(tickets).toEqual([1, 2, 3])
    })

    it('pedidos simultâneos recebem senhas diferentes, sem repetir nem pular', async () => {
      const results = await Promise.all(Array.from({ length: 10 }, () => order()))
      expect(results.every((r) => r.status === 201)).toBe(true)
      const tickets = results.map((r) => r.body.ticket).sort((a: number, b: number) => a - b)
      expect(tickets).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
    })

    it('recomeça em 1 no dia seguinte, enquanto o número interno continua crescendo', async () => {
      const a = (await order().expect(201)).body
      const b = (await order().expect(201)).body
      expect([a.ticket, b.ticket]).toEqual([1, 2])

      // "vira o dia": o contador de hoje passa a ser o de ontem
      await prisma.$executeRawUnsafe(`UPDATE "DailyCounter" SET "date" = '2000-01-01'`)
      const c = (await order().expect(201)).body
      expect(c.ticket).toBe(1)
      expect(c.number).toBeGreaterThan(b.number) // o id interno não reinicia
    })

    it('pedido que falha não consome senha (sem buracos)', async () => {
      await order().expect(201) // senha 1
      await order('CARD', [{ productId: 'brownie', qty: 5 }]).expect(409) // estoque insuficiente
      expect((await order().expect(201)).body.ticket).toBe(2)
    })

    it('o status público inclui a senha', async () => {
      const { body } = await order().expect(201)
      const res = await api().get(`/api/orders/${body.id}/status`).expect(200)
      expect(res.body).toMatchObject({ ticket: 1, status: 'PAID' })
    })
  })

  describe('fila pública (tela de senhas)', () => {
    it('acompanha o pedido: preparando → pronto → sai da fila', async () => {
      const { body } = await order().expect(201)
      expect(await queue()).toEqual({ preparing: [1], ready: [] })

      await move(body.id, 'PREPARING').expect(200)
      expect(await queue()).toEqual({ preparing: [1], ready: [] })

      await move(body.id, 'READY').expect(200)
      expect(await queue()).toEqual({ preparing: [], ready: [1] })

      await move(body.id, 'DELIVERED').expect(200)
      expect(await queue()).toEqual({ preparing: [], ready: [] })
    })

    it('não mostra pedidos pendentes de pagamento nem cancelados', async () => {
      await order('CASH').expect(201) // aguardando o caixa
      await order('PIX').expect(201) // aguardando o Pix
      const canceled = (await order().expect(201)).body
      await move(canceled.id, 'CANCELED').expect(200)
      expect(await queue()).toEqual({ preparing: [], ready: [] })
    })

    it('mostra só os pedidos de hoje', async () => {
      const yesterday = new Date(Date.now() - 36 * 60 * 60 * 1000)
      await prisma.order.create({ data: { mode: 'DINE_IN', totalCents: 100, status: 'READY', ticket: 77, createdAt: yesterday } })
      await order().expect(201)
      expect(await queue()).toEqual({ preparing: [1], ready: [] })
    })

    it('é pública mas só expõe números: sem itens, valores, ids ou dados de cliente', async () => {
      await order().expect(201)
      const res = await api().get('/api/queue').expect(200)
      expect(Object.keys(res.body).sort()).toEqual(['preparing', 'ready'])
      expect(JSON.stringify(res.body)).toBe('{"preparing":[1],"ready":[]}')
    })
  })
})
