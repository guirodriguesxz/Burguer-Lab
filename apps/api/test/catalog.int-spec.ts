import { NestExpressApplication } from '@nestjs/platform-express'
import { PrismaClient } from '@prisma/client'
import request from 'supertest'
import { bearer, createApp, loginAs, resetDb } from './helpers'

describe('cadastro de produtos, adicionais e categorias (integração)', () => {
  let app: NestExpressApplication
  let prisma: PrismaClient
  let admin: string
  let kitchen: string

  const api = () => request(app.getHttpServer())
  const post = (url: string, body: object = {}, token = admin) => api().post(`/api/admin${url}`).set(bearer(token)).send(body)
  const patch = (url: string, body: object, token = admin) => api().patch(`/api/admin${url}`).set(bearer(token)).send(body)
  const del = (url: string, token = admin) => api().delete(`/api/admin${url}`).set(bearer(token))
  const menu = async () => (await api().get('/api/menu').expect(200)).body as { categories: { id: string }[]; products: any[] }
  const buy = (productId: string, extraIds: string[] = []) =>
    api().post('/api/orders').send({ mode: 'DINE_IN', method: 'CARD', items: [{ productId, qty: 1, extraIds }] })

  const newProduct = (over: object = {}) => ({ name: 'X-Bacon Duplo', description: 'Dois blends', priceCents: 3590, emoji: '🍔', categoryId: 'burgers', stock: 20, removable: ['Cebola'], ...over })

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
    ;[admin, kitchen] = await Promise.all([loginAs(app, 'admin'), loginAs(app, 'kitchen')])
  })

  it('só o admin acessa o cadastro', async () => {
    await api().get('/api/admin/products').expect(401)
    await api().get('/api/admin/products').set(bearer(kitchen)).expect(403)
    await post('/products', newProduct(), kitchen).expect(403)
    await patch('/products/classic', { priceCents: 1 }, kitchen).expect(403)
    await del('/products/classic', kitchen).expect(403)
    await post('/categories', { label: 'Novo', emoji: '🍕' }, kitchen).expect(403)
  })

  describe('produtos', () => {
    it('cria o produto, que aparece no cardápio público e pode ser vendido', async () => {
      const { body } = await post('/products', newProduct({ name: 'Pão de Açaí Ñoño!' })).expect(201)
      expect(body).toMatchObject({ name: 'Pão de Açaí Ñoño!', priceCents: 3590, stock: 20, available: true, archived: false, removable: ['Cebola'], extras: [] })
      expect(body.id).toMatch(/^pao-de-acai-nono-[a-f0-9]{6}$/) // id legível, sem acento

      const m = await menu()
      expect(m.products.find((p) => p.id === body.id)).toMatchObject({ name: 'Pão de Açaí Ñoño!', priceCents: 3590, available: true })
      const order = await buy(body.id).expect(201)
      expect(order.body.totalCents).toBe(3590)
      expect((await prisma.product.findUniqueOrThrow({ where: { id: body.id } })).stock).toBe(19)
    })

    it('aplica padrões (sem estoque definido = ilimitado, ativo) e recusa dados inválidos', async () => {
      const ok = await post('/products', { name: 'Suco', priceCents: 900, emoji: '🧃', categoryId: 'drinks' }).expect(201)
      expect(ok.body).toMatchObject({ stock: null, available: true, description: '', removable: [] })

      await post('/products', newProduct({ name: 'X' })).expect(400) // nome curto
      await post('/products', newProduct({ priceCents: 0 })).expect(400)
      await post('/products', newProduct({ priceCents: -5 })).expect(400)
      await post('/products', newProduct({ priceCents: 10.5 })).expect(400)
      await post('/products', newProduct({ priceCents: 2_000_000 })).expect(400)
      await post('/products', newProduct({ stock: -1 })).expect(400)
      await post('/products', newProduct({ emoji: '🍔🍟🥤🍦🍫🍩🍪🍰🍕' })).expect(400)
      await post('/products', newProduct({ removable: ['Cebola', 'Cebola'] })).expect(400)
      await post('/products', newProduct({ removable: Array(16).fill('x').map((x, i) => `${x}${i}`) })).expect(400)
      await post('/products', newProduct({ categoryId: 'nao-existe' })).expect(400)
      await post('/products', { name: 'Sem categoria', priceCents: 100, emoji: '🍔' }).expect(400)
    })

    it('edita nome, preço, estoque, ingredientes e categoria; o preço novo vale na próxima venda', async () => {
      const res = await patch('/products/classic', { name: 'Clássico Premium', priceCents: 2990, stock: 5, removable: ['Alface'], categoryId: 'sides' }).expect(200)
      expect(res.body).toMatchObject({ name: 'Clássico Premium', priceCents: 2990, stock: 5, removable: ['Alface'], categoryId: 'sides' })

      const sale = await buy('classic').expect(201)
      expect(sale.body.totalCents).toBe(2990)
      expect(sale.body.items[0].productName).toBe('Clássico Premium')

      await patch('/products/classic', {}).expect(400)
      await patch('/products/classic', { priceCents: 0 }).expect(400)
      await patch('/products/classic', { categoryId: 'nao-existe' }).expect(400)
      await patch('/products/nao-existe', { priceCents: 100 }).expect(404)
    })

    it('mudar o preço não altera pedidos já feitos (o item guarda nome e preço da venda)', async () => {
      const before = (await buy('fries').expect(201)).body
      await patch('/products/fries', { priceCents: 9999, name: 'Nome Novo' }).expect(200)
      const stored = await prisma.orderItem.findFirstOrThrow({ where: { orderId: before.id } })
      expect(stored).toMatchObject({ productName: 'Batata', unitPriceCents: 1490 })
    })

    it('"excluir" arquiva: some do cardápio e não pode mais ser vendido, mas o histórico permanece', async () => {
      const sold = (await buy('classic').expect(201)).body

      const res = await del('/products/classic').expect(200)
      expect(res.body).toMatchObject({ archived: true, available: false })

      expect((await menu()).products.map((p) => p.id)).not.toContain('classic')
      expect((await api().get('/api/admin/products').set(bearer(admin)).expect(200)).body.map((p: { id: string }) => p.id)).not.toContain('classic')
      const archived = await api().get('/api/admin/products?archived=true').set(bearer(admin)).expect(200)
      expect(archived.body.map((p: { id: string }) => p.id)).toEqual(['classic'])

      await buy('classic').expect(409) // arquivado não vende, nem por requisição direta
      await patch('/products/classic', { available: true }).expect(409) // não dá para "ativar" sem restaurar

      // pedido antigo intacto
      const history = await api().get('/api/admin/orders').set(bearer(admin)).expect(200)
      expect(history.body.items.find((o: { id: string }) => o.id === sold.id).items[0].productName).toBe('Clássico')
    })

    it('restaurar traz o produto de volta pausado; ativar o devolve ao cardápio', async () => {
      await del('/products/classic').expect(200)
      const restored = await post('/products/classic/restore').expect(200)
      expect(restored.body).toMatchObject({ archived: false, available: false })
      expect((await menu()).products.find((p) => p.id === 'classic')).toMatchObject({ available: false }) // aparece, mas esgotado

      await patch('/products/classic', { available: true }).expect(200)
      await buy('classic').expect(201)
    })

    it('produto arquivado não é sugerido no upsell', async () => {
      await del('/products/cola').expect(200)
      const res = await api().get('/api/menu/upsell?productIds=classic').expect(200)
      expect(res.body.map((s: { product: { id: string } }) => s.product.id)).not.toContain('cola')
    })
  })

  describe('adicionais', () => {
    it('adiciona, edita o preço e remove; o servidor sempre cobra o preço atual', async () => {
      const added = await post('/products/classic/extras', { name: 'Queijo Brie', priceCents: 600 }).expect(201)
      expect(added.body.id).toMatch(/^classic-queijo-brie-[a-f0-9]{6}$/)
      expect((await menu()).products.find((p) => p.id === 'classic').extras.map((e: { name: string }) => e.name)).toContain('Queijo Brie')

      const first = await buy('classic', [added.body.id]).expect(201)
      expect(first.body.totalCents).toBe(2490 + 600)

      await patch(`/extras/${added.body.id}`, { priceCents: 800 }).expect(200)
      const second = await buy('classic', [added.body.id]).expect(201)
      expect(second.body.totalCents).toBe(2490 + 800)
      // o pedido antigo mantém o preço da época
      expect((await prisma.orderItem.findFirstOrThrow({ where: { orderId: first.body.id } })).extras).toEqual([
        expect.objectContaining({ name: 'Queijo Brie', priceCents: 600 }),
      ])

      await del(`/extras/${added.body.id}`).expect(200)
      await buy('classic', [added.body.id]).expect(400) // não existe mais
      await del(`/extras/${added.body.id}`).expect(404)
    })

    it('valida os campos, aceita adicional grátis e limita a quantidade por produto', async () => {
      await post('/products/classic/extras', { name: 'X', priceCents: 100 }).expect(400)
      await post('/products/classic/extras', { name: 'Molho', priceCents: -1 }).expect(400)
      await post('/products/classic/extras', { name: 'Guardanapo extra', priceCents: 0 }).expect(201) // grátis é permitido
      await post('/products/nao-existe/extras', { name: 'Molho', priceCents: 100 }).expect(404)

      for (let i = 0; i < 10; i++) await post('/products/classic/extras', { name: `Extra ${i}`, priceCents: 100 }).expect(201)
      await post('/products/classic/extras', { name: 'Um a mais', priceCents: 100 }).expect(409) // já são 12
    })

    it('não adiciona adicional a produto arquivado', async () => {
      await del('/products/classic').expect(200)
      await post('/products/classic/extras', { name: 'Molho', priceCents: 100 }).expect(409)
    })
  })

  describe('categorias', () => {
    it('categoria sem produtos à venda não vira aba vazia no totem', async () => {
      const cat = (await post('/categories', { label: 'Saladas', emoji: '🥗' }).expect(201)).body
      expect(cat.id).toMatch(/^saladas-[a-f0-9]{6}$/)
      expect((await menu()).categories.map((c) => c.id)).not.toContain(cat.id)

      await post('/products', newProduct({ name: 'Salada Caesar', categoryId: cat.id })).expect(201)
      expect((await menu()).categories.map((c) => c.id)).toContain(cat.id)
    })

    it('renomeia e só exclui categoria vazia', async () => {
      const cat = (await post('/categories', { label: 'Saladas', emoji: '🥗' }).expect(201)).body
      expect((await patch(`/categories/${cat.id}`, { label: 'Saladas e Bowls' }).expect(200)).body.label).toBe('Saladas e Bowls')

      const product = (await post('/products', newProduct({ categoryId: cat.id })).expect(201)).body
      await del(`/categories/${cat.id}`).expect(409) // tem produto
      await del(`/products/${product.id}`).expect(200)
      await del(`/categories/${cat.id}`).expect(409) // arquivado também conta (o histórico aponta para ela)
      await patch(`/products/${product.id}`, { categoryId: 'burgers' }).expect(200)
      await del(`/categories/${cat.id}`).expect(200)
      await del(`/categories/${cat.id}`).expect(404)

      await post('/categories', { label: 'A', emoji: '🥗' }).expect(400)
    })
  })
})
