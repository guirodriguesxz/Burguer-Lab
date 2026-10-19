// Precisa vir antes de a aplicação ser carregada (o limite é lido na definição do controller).
process.env.LOGIN_RATE_LIMIT = '4'
process.env.ORDER_RATE_LIMIT = '3'
process.env.COUPON_RATE_LIMIT = '2'
process.env.RESET_RATE_LIMIT = '3'

import { NestExpressApplication } from '@nestjs/platform-express'
import { PrismaClient } from '@prisma/client'
import request from 'supertest'
import { createApp, resetDb } from './helpers'

describe('rate limit do login (integração)', () => {
  let app: NestExpressApplication
  let prisma: PrismaClient

  beforeAll(async () => {
    prisma = new PrismaClient()
    app = await createApp()
    await resetDb(prisma)
  })
  afterAll(async () => {
    await app.close()
    await prisma.$disconnect()
  })

  it('bloqueia depois de 4 tentativas no mesmo minuto, inclusive com a senha certa', async () => {
    const login = (password: string) =>
      request(app.getHttpServer()).post('/api/auth/login').send({ email: 'admin@test.dev', password })

    const statuses: number[] = []
    for (let i = 0; i < 4; i++) statuses.push((await login('errada')).status)
    statuses.push((await login('admin-pass')).status) // já bloqueado, mesmo acertando
    expect(statuses).toEqual([401, 401, 401, 401, 429])
  })

  it('limita a criação de pedidos, a validação de cupons e os pedidos de redefinição de senha', async () => {
    const order = () =>
      request(app.getHttpServer()).post('/api/orders').send({ mode: 'DINE_IN', method: 'CARD', items: [{ productId: 'cola', qty: 1 }] })
    const orders: number[] = []
    for (let i = 0; i < 4; i++) orders.push((await order()).status)
    expect(orders).toEqual([201, 201, 201, 429])

    const coupon = () =>
      request(app.getHttpServer()).post('/api/coupons/validate').send({ code: 'PCT10', items: [{ productId: 'cola', qty: 1 }] })
    const coupons: number[] = []
    for (let i = 0; i < 3; i++) coupons.push((await coupon()).status)
    expect(coupons).toEqual([200, 200, 429])

    const forgot = () => request(app.getHttpServer()).post('/api/auth/forgot-password').send({ email: 'admin@test.dev' })
    const resets: number[] = []
    for (let i = 0; i < 4; i++) resets.push((await forgot()).status)
    expect(resets).toEqual([202, 202, 202, 429])
  })
})
