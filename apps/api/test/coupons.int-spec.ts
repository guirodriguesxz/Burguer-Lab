import { NestExpressApplication } from '@nestjs/platform-express'
import { PrismaClient } from '@prisma/client'
import request from 'supertest'
import { bearer, createApp, loginAs, resetDb } from './helpers'

describe('cupons e upsell (integração)', () => {
  let app: NestExpressApplication
  let prisma: PrismaClient
  let admin: string
  let kitchen: string

  const validate = (code: string, items: object[]) =>
    request(app.getHttpServer()).post('/api/coupons/validate').send({ code, items })
  const order = (couponCode: string, items: object[], method = 'CARD') =>
    request(app.getHttpServer()).post('/api/orders').send({ mode: 'DINE_IN', method, couponCode, items })

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
    admin = await loginAs(app, 'admin')
    kitchen = await loginAs(app, 'kitchen')
  })

  it('valida e calcula o desconto sem consumir o cupom', async () => {
    const res = await validate(' pct10 ', [{ productId: 'classic', qty: 2 }]).expect(200)
    expect(res.body).toMatchObject({ valid: true, code: 'PCT10', subtotalCents: 4980, discountCents: 498, totalCents: 4482 })
    expect((await prisma.coupon.findUnique({ where: { code: 'PCT10' } }))!.usedCount).toBe(0)
  })

  it('explica por que um cupom não vale', async () => {
    const small = [{ productId: 'fries', qty: 1 }]
    expect((await validate('NAOEXISTE', small)).body).toEqual({ valid: false, reason: 'Cupom inválido', code: 'INVALID' })
    expect((await validate('FIXED5', small)).body.reason).toMatch(/mínimo/)
    await prisma.coupon.update({ where: { code: 'PCT10' }, data: { expiresAt: new Date('2020-01-01') } })
    expect((await validate('PCT10', small)).body.reason).toBe('Cupom expirado')
    await prisma.coupon.update({ where: { code: 'PCT10' }, data: { expiresAt: null, active: false } })
    expect((await validate('PCT10', small)).body.valid).toBe(false)
  })

  it('o pedido usa o desconto do servidor e registra o cupom', async () => {
    const res = await order('pct10', [{ productId: 'classic', qty: 1 }]).expect(201)
    expect(res.body).toMatchObject({ discountCents: 249, totalCents: 2241, couponCode: 'PCT10' })
    expect((await prisma.coupon.findUnique({ where: { code: 'PCT10' } }))!.usedCount).toBe(1)
  })

  it('cupom inválido impede o pedido e não baixa estoque', async () => {
    await order('NAOEXISTE', [{ productId: 'classic', qty: 1 }]).expect(400)
    expect((await prisma.product.findUnique({ where: { id: 'classic' } }))!.stock).toBe(10)
  })

  it('cupom de uso único: pedidos simultâneos, só um aplica', async () => {
    const items = [{ productId: 'cola', qty: 1 }]
    const results = await Promise.all([order('ONCE', items), order('ONCE', items), order('ONCE', items)])
    expect(results.map((r) => r.status).sort()).toEqual([201, 400, 400])
    expect((await prisma.coupon.findUnique({ where: { code: 'ONCE' } }))!.usedCount).toBe(1)
    // os pedidos recusados não deixaram estoque ou pedido para trás
    expect(await prisma.order.count()).toBe(1)
  })

  it('admin cria cupom; código duplicado e percentual inválido são recusados; cozinha não pode', async () => {
    const create = (token: string, body: object) =>
      request(app.getHttpServer()).post('/api/admin/coupons').set(bearer(token)).send(body)

    const ok = await create(admin, { code: 'verao20', type: 'PERCENT', value: 20 }).expect(201)
    expect(ok.body.code).toBe('VERAO20')
    await create(admin, { code: 'VERAO20', type: 'PERCENT', value: 5 }).expect(409)
    await create(admin, { code: 'MUITO', type: 'PERCENT', value: 150 }).expect(400)
    await create(kitchen, { code: 'HACK', type: 'PERCENT', value: 99 }).expect(403)
    await request(app.getHttpServer()).post('/api/admin/coupons').send({ code: 'ANON', type: 'PERCENT', value: 5 }).expect(401)
  })

  it('upsell sugere só o que falta no carrinho e nunca itens pausados ou esgotados', async () => {
    await prisma.product.update({ where: { id: 'brownie' }, data: { stock: 0 } })
    const res = await request(app.getHttpServer()).get('/api/menu/upsell?productIds=classic').expect(200)
    const ids = res.body.map((s: { product: { id: string } }) => s.product.id)
    expect(ids).toEqual(['cola', 'fries']) // bebida e acompanhamento; sobremesa esgotada/pausada fica de fora

    const withDrink = await request(app.getHttpServer()).get('/api/menu/upsell?productIds=classic,cola').expect(200)
    expect(withDrink.body.map((s: { product: { id: string } }) => s.product.id)).toEqual(['fries'])
  })
})
