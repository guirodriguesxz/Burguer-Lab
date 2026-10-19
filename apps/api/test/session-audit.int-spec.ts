import { AddressInfo } from 'node:net'
import { JwtService } from '@nestjs/jwt'
import { NestExpressApplication } from '@nestjs/platform-express'
import { PrismaClient } from '@prisma/client'
import { io, Socket } from 'socket.io-client'
import request from 'supertest'
import { AuditService } from '../src/audit/audit.service'
import { SessionService } from '../src/auth/session.service'
import { PrismaService } from '../src/prisma/prisma.service'
import { bearer, createApp, loginAs, resetDb, sleep, tokenOf } from './helpers'

const XHR = { 'X-Requested-With': 'XMLHttpRequest' }

describe('sessão em cookie e auditoria (integração)', () => {
  let app: NestExpressApplication
  let prisma: PrismaClient
  let admin: string

  const api = () => request(app.getHttpServer())
  const login = (email: string, password: string) => api().post('/api/auth/login').send({ email, password })
  const asAdminCookie = (token: string) => ({ Cookie: `bl_session=${token}` })
  const audit = async (where: object = {}) => prisma.auditLog.findMany({ where, orderBy: { at: 'asc' } })

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
    await prisma.$executeRawUnsafe('TRUNCATE "AuditLog","RevokedToken"')
    admin = await loginAs(app, 'admin')
    await prisma.$executeRawUnsafe('TRUNCATE "AuditLog"') // começa cada teste sem o registro do login de preparação
  })

  describe('cookie de sessão', () => {
    it('o login entrega o token só no cookie HttpOnly + SameSite=Strict, nunca no corpo', async () => {
      const res = await login('admin@test.dev', 'admin-pass').expect(201)
      expect(res.body.token).toBeUndefined()
      expect(JSON.stringify(res.body)).not.toMatch(/eyJ/) // nenhum JWT na resposta

      const cookie = ([] as string[]).concat(res.headers['set-cookie'] as unknown as string[]).find((c) => c.startsWith('bl_session='))!
      expect(cookie).toMatch(/HttpOnly/i)
      expect(cookie).toMatch(/SameSite=Strict/i)
      expect(cookie).toMatch(/Path=\//)
      expect(cookie).toMatch(/Max-Age=28800/) // 8 horas
    })

    it('a sessão por cookie funciona (GET) e /auth/me devolve só dados públicos do usuário', async () => {
      const agent = request.agent(app.getHttpServer())
      await agent.post('/api/auth/login').send({ email: 'admin@test.dev', password: 'admin-pass' }).expect(201)
      const me = await agent.get('/api/auth/me').expect(200)
      expect(me.body).toEqual({ id: expect.any(String), name: 'Admin', email: 'admin@test.dev', role: 'ADMIN' })
      await agent.get('/api/admin/products').expect(200)
    })

    it('CSRF: com cookie, requisições que alteram dados exigem o cabeçalho X-Requested-With', async () => {
      const cookie = asAdminCookie(admin)
      const body = { name: 'Teste', priceCents: 100, emoji: '🍔', categoryId: 'burgers' }

      await api().get('/api/admin/products').set(cookie).expect(200) // leitura não precisa
      await api().post('/api/admin/products').set(cookie).send(body).expect(403) // sem o cabeçalho: bloqueado
      await api().patch('/api/admin/products/classic').set(cookie).send({ priceCents: 1 }).expect(403)
      await api().delete('/api/admin/products/classic').set(cookie).expect(403)
      expect((await prisma.product.findUniqueOrThrow({ where: { id: 'classic' } })).priceCents).toBe(2490) // nada mudou

      await api().post('/api/admin/products').set(cookie).set(XHR).send(body).expect(201) // com o cabeçalho: passa
    })

    it('Bearer (clientes de API) não precisa do cabeçalho de CSRF: não é enviado automaticamente por navegadores', async () => {
      await api().patch('/api/admin/products/classic').set(bearer(admin)).send({ priceCents: 2500 }).expect(200)
    })

    it('cookie adulterado ou expirado é recusado', async () => {
      await api().get('/api/admin/products').set(asAdminCookie(admin + 'x')).expect(401)
      const expired = await app.get(JwtService).signAsync({ sub: 'u', role: 'ADMIN', name: 'x', tv: 0 }, { expiresIn: '-1s' })
      await api().get('/api/admin/products').set(asAdminCookie(expired)).expect(401)
    })
  })

  describe('logout', () => {
    it('encerra só esta sessão: o token deixa de valer e o cookie é limpo, mas outras telas continuam', async () => {
      const other = tokenOf(await login('admin@test.dev', 'admin-pass').expect(201))
      await api().get('/api/auth/me').set(bearer(admin)).expect(200)

      const res = await api().post('/api/auth/logout').set(asAdminCookie(admin)).set(XHR).expect(200)
      expect(([] as string[]).concat(res.headers['set-cookie'] as unknown as string[]).join(';')).toMatch(/bl_session=;.*Expires=Thu, 01 Jan 1970/i)

      await api().get('/api/auth/me').set(bearer(admin)).expect(401) // o token antigo foi revogado
      await api().get('/api/auth/me').set(bearer(other)).expect(200) // a outra sessão da mesma pessoa segue valendo
      expect(await prisma.revokedToken.count()).toBe(1)
    })

    it('sair sem sessão válida é recusado, e o logout também exige o cabeçalho de CSRF no cookie', async () => {
      await api().post('/api/auth/logout').expect(401)
      await api().post('/api/auth/logout').set(asAdminCookie(admin)).expect(403) // sem X-Requested-With
      await api().get('/api/auth/me').set(bearer(admin)).expect(200) // continua logado
    })

    it('tokens revogados que já expirariam são apagados (a lista não cresce para sempre)', async () => {
      const sessions = app.get(SessionService)
      await prisma.revokedToken.createMany({
        data: [
          { jti: 'velho', expiresAt: new Date(Date.now() - 60_000) },
          { jti: 'valido', expiresAt: new Date(Date.now() + 3_600_000) },
        ],
      })
      await sessions.purgeRevoked()
      expect((await prisma.revokedToken.findMany()).map((r) => r.jti)).toEqual(['valido'])
    })
  })

  describe('WebSocket com cookie', () => {
    let url: string
    const sockets: Socket[] = []
    const connect = (headers: Record<string, string>) => {
      const s = io(url, { transports: ['websocket'], reconnection: false, extraHeaders: headers })
      sockets.push(s)
      return s
    }
    const orderEvents = (s: Socket) => {
      const got: unknown[] = []
      s.on('order:created', (o) => got.push(o))
      return got
    }
    const gone = (s: Socket) => new Promise<boolean>((res) => (s.disconnected ? res(true) : (setTimeout(() => res(false), 1500), s.once('disconnect', () => res(true)))))
    const placeOrder = () =>
      api().post('/api/orders').send({ mode: 'DINE_IN', method: 'CARD', items: [{ productId: 'cola', qty: 1 }] }).expect(201)

    beforeAll(async () => {
      await app.listen(0)
      url = `http://localhost:${(app.getHttpServer().address() as AddressInfo).port}`
    })
    afterEach(() => {
      sockets.splice(0).forEach((s) => s.close())
      delete process.env.CORS_ORIGIN
    })

    it('o navegador autentica o WebSocket pelo cookie, sem token no JavaScript', async () => {
      const s = connect({ Cookie: `bl_session=${admin}` })
      await new Promise<void>((res) => s.once('connect', () => res()))
      const got = orderEvents(s)
      await placeOrder()
      await sleep(300)
      expect(got).toHaveLength(1)
    })

    it('com origens restritas, cookie vindo de outro site é recusado; do próprio site e da lista permitida passam', async () => {
      process.env.CORS_ORIGIN = 'https://loja.test'
      const host = url.replace('http://', '')

      const evil = connect({ Cookie: `bl_session=${admin}`, Origin: 'https://evil.test' })
      expect(await gone(evil)).toBe(true) // sequestro de WebSocket entre sites

      for (const origin of ['https://loja.test', `http://${host}`]) {
        const ok = connect({ Cookie: `bl_session=${admin}`, Origin: origin })
        await new Promise<void>((res) => ok.once('connect', () => res()))
        const got = orderEvents(ok)
        await placeOrder()
        await sleep(300)
        expect(got.length).toBeGreaterThan(0)
        ok.close()
      }
    })

    it('logout derruba a sessão: reconectar com o cookie revogado não entra na sala da equipe', async () => {
      await api().post('/api/auth/logout').set(asAdminCookie(admin)).set(XHR).expect(200)
      const s = connect({ Cookie: `bl_session=${admin}` })
      expect(await gone(s)).toBe(true)
    })
  })

  describe('trilha de auditoria', () => {
    const adminApi = {
      patch: (u: string, b: object) => api().patch(`/api/admin${u}`).set(bearer(admin)).send(b),
      post: (u: string, b: object = {}) => api().post(`/api/admin${u}`).set(bearer(admin)).send(b),
      del: (u: string) => api().delete(`/api/admin${u}`).set(bearer(admin)),
    }

    it('registra login, falha de login e logout, sem nunca guardar senha ou token', async () => {
      await login('admin@test.dev', 'senha-errada-xyz').expect(401)
      await login('ninguem@test.dev', 'outra-senha-abc').expect(401)
      const ok = await login('admin@test.dev', 'admin-pass').expect(201)
      await api().post('/api/auth/logout').set(asAdminCookie(tokenOf(ok))).set(XHR).expect(200)

      const rows = await audit()
      expect(rows.map((r) => r.action)).toEqual(['auth.login_failed', 'auth.login_failed', 'auth.login', 'auth.logout'])
      expect(rows[0].meta).toEqual({ email: 'admin@test.dev' })
      expect(rows[1].meta).toEqual({ email: 'ninguem@test.dev' })
      expect(rows[2]).toMatchObject({ actorEmail: 'admin@test.dev', entity: 'User' })
      expect(rows[2].ip).toBeTruthy()

      const dump = JSON.stringify(rows)
      expect(dump).not.toMatch(/senha-errada|outra-senha|admin-pass|eyJ|\$2[aby]\$/)
    })

    it('registra mudanças de preço e estoque com o valor antes e depois, e quem fez', async () => {
      await adminApi.patch('/products/classic', { priceCents: 2990, stock: 5, name: 'Clássico' }).expect(200)
      const [row] = await audit({ action: 'product.update' })
      expect(row).toMatchObject({ actorEmail: 'admin@test.dev', entity: 'Product', entityId: 'classic' })
      expect(row.meta).toEqual({ name: 'Clássico', changes: { priceCents: { de: 2490, para: 2990 }, stock: { de: 10, para: 5 } } })
    })

    it('registra cadastro do cardápio, cupons, usuários e exportações', async () => {
      const created = (await adminApi.post('/products', { name: 'Novo', priceCents: 500, emoji: '🍔', categoryId: 'burgers' }).expect(201)).body
      await adminApi.post(`/products/${created.id}/extras`, { name: 'Molho', priceCents: 100 }).expect(201)
      await adminApi.del(`/products/${created.id}`).expect(200)
      await adminApi.post('/coupons', { code: 'PROMO15', type: 'PERCENT', value: 15 }).expect(201)
      const kitchenId = (await prisma.user.findUniqueOrThrow({ where: { email: 'kitchen@test.dev' } })).id
      await adminApi.patch(`/users/${kitchenId}`, { active: false }).expect(200)
      await api().get('/api/admin/orders/export.csv?status=PAID').set(bearer(admin)).expect(200)

      const actions = (await audit()).map((r) => r.action)
      expect(actions).toEqual(['product.create', 'extra.create', 'product.archive', 'coupon.create', 'user.update', 'export.orders_csv'])
      const userRow = (await audit({ action: 'user.update' }))[0]
      expect(userRow.meta).toMatchObject({ email: 'kitchen@test.dev', changes: { active: { de: true, para: false } } })
      expect((await audit({ action: 'export.orders_csv' }))[0].meta).toMatchObject({ rows: 0, filters: { status: 'PAID' } })
    })

    it('registra cancelamento, estorno e confirmação de caixa', async () => {
      const place = (method: string) =>
        api().post('/api/orders').send({ mode: 'DINE_IN', method, items: [{ productId: 'cola', qty: 1 }] }).expect(201)
      const card = (await place('CARD')).body
      const cash = (await place('CASH')).body

      await api().post(`/api/orders/${cash.id}/confirm-cash`).set(bearer(admin)).expect(200)
      await api().patch(`/api/orders/${card.id}/status`).set(bearer(admin)).send({ status: 'PREPARING' }).expect(200) // rotina: não audita
      await adminApi.post(`/orders/${card.id}/refund`).expect(200)

      const rows = await audit()
      // o estorno pelo admin cancela o pedido por dentro: um único registro, com o resultado do estorno
      expect(rows.map((r) => r.action)).toEqual(['payment.cash_confirmed', 'payment.refund'])
      expect(rows[0].meta).toMatchObject({ amountCents: 890 })
      expect(rows[1].meta).toMatchObject({ amountCents: 890, method: 'CARD', result: 'REFUNDED' })

      // cancelar direto pela cozinha também é registrado, com o estado do pagamento
      const other = (await place('CARD')).body
      await api().patch(`/api/orders/${other.id}/status`).set(bearer(admin)).send({ status: 'CANCELED' }).expect(200)
      const cancel = (await audit({ action: 'order.cancel' }))[0]
      expect(cancel).toMatchObject({ actorEmail: 'admin@test.dev', entityId: other.id })
      expect(cancel.meta).toMatchObject({ totalCents: 890, payment: 'REFUNDED' })
    })

    it('registra troca e redefinição de senha', async () => {
      const kitchen = await loginAs(app, 'kitchen')
      await prisma.$executeRawUnsafe('TRUNCATE "AuditLog"')
      await api().post('/api/auth/change-password').set(bearer(kitchen)).send({ currentPassword: 'kitchen-pass', newPassword: 'nova-senha-2026' }).expect(200)
      expect((await audit()).map((r) => [r.action, r.actorEmail])).toEqual([['auth.password_changed', 'kitchen@test.dev']])
    })

    it('falha na auditoria nunca derruba a operação principal', async () => {
      const spy = jest.spyOn(app.get(PrismaService).auditLog, 'create').mockRejectedValue(new Error('banco de auditoria fora'))
      try {
        await adminApi.patch('/products/fries', { priceCents: 1600 }).expect(200)
      } finally {
        spy.mockRestore()
      }
      expect((await prisma.product.findUniqueOrThrow({ where: { id: 'fries' } })).priceCents).toBe(1600)
    })

    it('a consulta é só do admin, filtra por ação, pessoa e data, pagina e ordena do mais novo ao mais antigo', async () => {
      await adminApi.patch('/products/fries', { priceCents: 1600 }).expect(200)
      await adminApi.post('/coupons', { code: 'PROMO20', type: 'PERCENT', value: 20 }).expect(201)
      await adminApi.patch('/products/cola', { priceCents: 1000 }).expect(200)
      const kitchen = await loginAs(app, 'kitchen')

      await api().get('/api/admin/audit').expect(401)
      await api().get('/api/admin/audit').set(bearer(kitchen)).expect(403)

      const list = (qs = '') => api().get(`/api/admin/audit${qs}`).set(bearer(admin))
      const all = (await list().expect(200)).body
      expect(all.total).toBe(4) // 3 ações + o login da cozinha
      expect(all.items.map((r: { action: string }) => r.action)).toEqual(['auth.login', 'product.update', 'coupon.create', 'product.update'])

      expect((await list('?action=product.').expect(200)).body.total).toBe(2)
      expect((await list('?action=coupon').expect(200)).body.total).toBe(1)
      expect((await list('?actor=KITCHEN@').expect(200)).body.items.map((r: { action: string }) => r.action)).toEqual(['auth.login'])
      expect((await list('?from=2000-01-01&to=2000-01-02').expect(200)).body.total).toBe(0)
      const page = (await list('?pageSize=2&page=2').expect(200)).body
      expect(page.items).toHaveLength(2)
      expect(page.total).toBe(4)
      await list('?pageSize=500').expect(400)
      await list('?from=ontem').expect(400)
    })

    it('apaga registros além do prazo de retenção e mantém os recentes', async () => {
      process.env.AUDIT_RETENTION_DAYS = '30'
      try {
        await prisma.auditLog.createMany({
          data: [
            { action: 'velho', at: new Date(Date.now() - 31 * 24 * 60 * 60 * 1000) },
            { action: 'recente', at: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000) },
          ],
        })
        await app.get(AuditService).purge()
      } finally {
        delete process.env.AUDIT_RETENTION_DAYS
      }
      expect((await audit()).map((r) => r.action)).toEqual(['recente'])
    })
  })
})
