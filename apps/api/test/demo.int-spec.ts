import { NestExpressApplication } from '@nestjs/platform-express'
import { PrismaClient } from '@prisma/client'
import request from 'supertest'
import { createApp, resetDb } from './helpers'

describe('modo demonstração (integração)', () => {
  let app: NestExpressApplication
  let prisma: PrismaClient
  const saved = { ...process.env }

  beforeAll(async () => {
    prisma = new PrismaClient()
    app = await createApp()
  })
  afterAll(async () => {
    await app.close()
    await prisma.$disconnect()
  })
  beforeEach(() => resetDb(prisma))
  afterEach(() => {
    process.env = { ...saved }
  })

  const createPix = async () =>
    (await request(app.getHttpServer()).post('/api/orders').send({ mode: 'DINE_IN', method: 'PIX', items: [{ productId: 'fries', qty: 1 }] }).expect(201)).body

  it('sem DEMO_MODE, /demo não mostra conta nenhuma', async () => {
    process.env.DEMO_LOGINS = 'Admin|a@x.com|segredo'
    const res = await request(app.getHttpServer()).get('/api/demo').expect(200)
    expect(res.body).toEqual({ demo: false, logins: [] })
  })

  it('em produção o simulador de Pix fica fechado, e abre só com DEMO_MODE=true', async () => {
    const order = await createPix()
    process.env.NODE_ENV = 'production'
    await request(app.getHttpServer()).post(`/api/dev/pix/${order.payment.txid}/pay`).expect(404)

    process.env.DEMO_MODE = 'true'
    process.env.DEMO_LOGINS = 'Cozinha|c@x.com|segredo'
    const info = await request(app.getHttpServer()).get('/api/demo').expect(200)
    expect(info.body).toEqual({ demo: true, logins: [{ label: 'Cozinha', email: 'c@x.com', password: 'segredo' }] })
    await request(app.getHttpServer()).post(`/api/dev/pix/${order.payment.txid}/pay`).expect(200)
  })

  it('com Pix real o modo demo não abre o simulador', async () => {
    const order = await createPix()
    process.env.NODE_ENV = 'production'
    process.env.DEMO_MODE = 'true'
    process.env.PIX_PROVIDER = 'mercadopago'
    await request(app.getHttpServer()).post(`/api/dev/pix/${order.payment.txid}/pay`).expect(404)
  })
})
