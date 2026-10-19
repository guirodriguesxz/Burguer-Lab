import { NestExpressApplication } from '@nestjs/platform-express'
import { JwtService } from '@nestjs/jwt'
import { PrismaClient } from '@prisma/client'
import request from 'supertest'
import { bearer, createApp, resetDb } from './helpers'

describe('autenticação, RBAC e relatórios (integração)', () => {
  let app: NestExpressApplication
  let prisma: PrismaClient

  const login = (email: string, password: string) =>
    request(app.getHttpServer()).post('/api/auth/login').send({ email, password })

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
  })

  it('login válido devolve token e usuário sem expor o hash da senha', async () => {
    const res = await login('admin@test.dev', 'admin-pass').expect(201)
    expect(res.body.user).toEqual(expect.objectContaining({ email: 'admin@test.dev', role: 'ADMIN' }))
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|\$2[aby]\$/)
    const me = await request(app.getHttpServer()).get('/api/auth/me').set(bearer(res.body.token)).expect(200)
    expect(me.body.role).toBe('ADMIN')
  })

  it('mesma mensagem para e-mail inexistente e senha errada', async () => {
    const a = await login('admin@test.dev', 'errada').expect(401)
    const b = await login('ninguem@test.dev', 'qualquer').expect(401)
    expect(a.body.message).toBe(b.body.message)
  })

  it('rejeita token ausente, adulterado, expirado e de papel insuficiente', async () => {
    const { body } = await login('kitchen@test.dev', 'kitchen-pass').expect(201)
    await request(app.getHttpServer()).get('/api/admin/products').expect(401)
    await request(app.getHttpServer()).get('/api/admin/products').set(bearer(body.token + 'x')).expect(401)

    const expired = await app.get(JwtService).signAsync({ sub: 'u', role: 'ADMIN', name: 'x' }, { expiresIn: '-1s' })
    await request(app.getHttpServer()).get('/api/admin/products').set(bearer(expired)).expect(401)

    await request(app.getHttpServer()).get('/api/admin/products').set(bearer(body.token)).expect(403) // cozinha ≠ admin
    await request(app.getHttpServer()).get('/api/admin/reports/summary').set(bearer(body.token)).expect(403)
  })

  describe('relatórios', () => {
    // Hora (0-23) em São Paulo de um instante, calculada independentemente do banco e do fuso do servidor.
    const spHour = (d: Date) =>
      Number(new Intl.DateTimeFormat('en-US', { hour: 'numeric', hourCycle: 'h23', timeZone: 'America/Sao_Paulo' }).format(d))

    let token: string
    beforeEach(async () => {
      token = (await login('admin@test.dev', 'admin-pass').expect(201)).body.token
    })

    it('agrupa por hora no fuso de São Paulo e ignora pedidos cancelados', async () => {
      const at = new Date(Date.now() - 2 * 60 * 60 * 1000)
      const mk = (totalCents: number, status: 'PAID' | 'CANCELED') =>
        prisma.order.create({ data: { mode: 'DINE_IN', totalCents, status, createdAt: at, items: { create: [{ productId: 'cola', productName: 'Refri', qty: 2, unitPriceCents: totalCents / 2 }] }, payment: { create: { method: 'CARD', amountCents: totalCents, status: status === 'PAID' ? 'PAID' : 'REFUNDED' } } } })
      await mk(2000, 'PAID')
      await mk(1000, 'PAID')
      await mk(9999, 'CANCELED')

      const res = await request(app.getHttpServer()).get('/api/admin/reports/summary?days=7').set(bearer(token)).expect(200)
      expect(res.body).toMatchObject({ orders: 2, revenueCents: 3000, avgTicketCents: 1500 })
      expect(res.body.byHour).toHaveLength(24)
      const hour = res.body.byHour[spHour(at)]
      expect(hour).toMatchObject({ orders: 2, revenueCents: 3000 })
      expect(res.body.byHour.reduce((s: number, h: { orders: number }) => s + h.orders, 0)).toBe(2)
      expect(res.body.topProducts[0]).toMatchObject({ name: 'Refri', qty: 4 })
    })
  })
})
