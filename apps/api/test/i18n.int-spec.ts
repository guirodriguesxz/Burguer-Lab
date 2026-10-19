import { NestExpressApplication } from '@nestjs/platform-express'
import { PrismaClient } from '@prisma/client'
import request from 'supertest'
import { bearer, createApp, loginAs, resetDb } from './helpers'

describe('tradução do cardápio e códigos de motivo (integração)', () => {
  let app: NestExpressApplication
  let prisma: PrismaClient
  let admin: string

  const api = () => request(app.getHttpServer())
  const post = (url: string, body: object) => api().post(`/api/admin${url}`).set(bearer(admin)).send(body)
  const patch = (url: string, body: object) => api().patch(`/api/admin${url}`).set(bearer(admin)).send(body)
  const menu = async () => (await api().get('/api/menu').expect(200)).body

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
  })

  it('produtos sem tradução vêm com campos em inglês nulos (o totem cai para o português)', async () => {
    const classic = (await menu()).products.find((p: { id: string }) => p.id === 'classic')
    expect(classic).toMatchObject({ name: 'Clássico', nameEn: null, descriptionEn: null })
  })

  it('o admin traduz produto, adicional e categoria, e o cardápio público devolve os textos em inglês', async () => {
    await patch('/products/classic', { nameEn: 'Classic Burger', descriptionEn: 'Beef patty and cheese' }).expect(200)
    const extra = (await post('/products/classic/extras', { name: 'Queijo Brie', nameEn: 'Brie cheese', priceCents: 600 }).expect(201)).body
    expect(extra.nameEn).toBe('Brie cheese')
    await patch('/categories/burgers', { labelEn: 'Burgers & Co' }).expect(200)

    const m = await menu()
    const classic = m.products.find((p: { id: string }) => p.id === 'classic')
    expect(classic).toMatchObject({ name: 'Clássico', nameEn: 'Classic Burger', descriptionEn: 'Beef patty and cheese' }) // o português continua
    expect(classic.extras.find((e: { id: string }) => e.id === extra.id).nameEn).toBe('Brie cheese')
    expect(m.categories.find((c: { id: string }) => c.id === 'burgers').labelEn).toBe('Burgers & Co')
  })

  it('texto em inglês vazio vira "sem tradução" (null); pode ser removido depois', async () => {
    await patch('/products/classic', { nameEn: 'Classic' }).expect(200)
    const cleared = await patch('/products/classic', { nameEn: '   ', descriptionEn: '' }).expect(200)
    expect(cleared.body).toMatchObject({ nameEn: null, descriptionEn: null })

    const created = await post('/products', { name: 'Novo', priceCents: 500, emoji: '🍔', categoryId: 'burgers', nameEn: '' }).expect(201)
    expect(created.body.nameEn).toBeNull()
  })

  it('valida o tamanho dos textos traduzidos', async () => {
    await patch('/products/classic', { nameEn: 'x'.repeat(61) }).expect(400)
    await patch('/products/classic', { descriptionEn: 'x'.repeat(201) }).expect(400)
    await post('/products/classic/extras', { name: 'Molho', nameEn: 'x'.repeat(41), priceCents: 100 }).expect(400)
    await patch('/categories/burgers', { labelEn: 'x'.repeat(41) }).expect(400)
  })

  it('tradução não altera o que o servidor grava nos pedidos (a cozinha continua em português)', async () => {
    await patch('/products/classic', { nameEn: 'Classic Burger' }).expect(200)
    const order = await api().post('/api/orders').send({ mode: 'DINE_IN', method: 'CARD', items: [{ productId: 'classic', qty: 1 }] }).expect(201)
    expect(order.body.items[0].productName).toBe('Clássico')
  })

  it('o upsell informa o tipo da sugestão (para o totem traduzir o motivo) e o nome em inglês', async () => {
    await patch('/products/cola', { nameEn: 'Soda' }).expect(200)
    const res = await api().get('/api/menu/upsell?productIds=classic').expect(200)
    const drink = res.body.find((s: { kind: string }) => s.kind === 'drinks')
    expect(drink).toMatchObject({ kind: 'drinks', reason: 'Que tal uma bebida?', product: { id: 'cola', nameEn: 'Soda' } })
    expect(res.body.map((s: { kind: string }) => s.kind)).toEqual(['drinks', 'sides', 'desserts'].filter((k) => res.body.some((s: { kind: string }) => s.kind === k)))
  })

  it('cupom recusado traz um código estável e o valor mínimo, para o totem traduzir', async () => {
    const validate = (code: string, qty = 1) =>
      api().post('/api/coupons/validate').send({ code, items: [{ productId: 'fries', qty }] }).expect(200)

    expect((await validate('NAOEXISTE')).body).toMatchObject({ valid: false, code: 'INVALID' })
    expect((await validate('FIXED5')).body).toMatchObject({ valid: false, code: 'MIN_ORDER', minOrderCents: 3000 })
    await prisma.coupon.update({ where: { code: 'PCT10' }, data: { expiresAt: new Date('2020-01-01') } })
    expect((await validate('PCT10')).body).toMatchObject({ valid: false, code: 'EXPIRED' })
    await prisma.coupon.update({ where: { code: 'ONCE' }, data: { usedCount: 1 } })
    expect((await validate('ONCE')).body).toMatchObject({ valid: false, code: 'EXHAUSTED' })
    expect((await validate('FIXED5', 3)).body).toMatchObject({ valid: true }) // 3 batatas: passa do mínimo
  })
})
