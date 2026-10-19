import { NestExpressApplication } from '@nestjs/platform-express'
import { PrismaClient } from '@prisma/client'
import request from 'supertest'
import { Mail, Mailer } from '../src/mail/mailer'
import { bearer, createApp, loginAs, resetDb, sleep, tokenOf } from './helpers'

describe('usuários, troca de senha e histórico de pedidos (integração)', () => {
  let app: NestExpressApplication
  let prisma: PrismaClient
  let admin: string
  let kitchen: string
  let sent: Mail[]

  const api = () => request(app.getHttpServer())
  // o CSV é binário (tem BOM): pega os bytes crus, sem decodificação do supertest
  const binary = (res: any, cb: (err: Error | null, body: Buffer) => void) => {
    const chunks: Buffer[] = []
    res.on('data', (c: Buffer) => chunks.push(c))
    res.on('end', () => cb(null, Buffer.concat(chunks)))
  }
  const csv = (qs = '') => api().get(`/api/admin/orders/export.csv${qs}`).set(bearer(admin)).buffer(true).parse(binary)
  const login = (email: string, password: string) => api().post('/api/auth/login').send({ email, password })
  const userId = async (email: string) => (await prisma.user.findUniqueOrThrow({ where: { email } })).id

  beforeAll(async () => {
    prisma = new PrismaClient()
    sent = []
    app = await createApp((b) => b.overrideProvider(Mailer).useValue({ send: async (m: Mail) => void sent.push(m) }))
  })
  afterAll(async () => {
    await app.close()
    await prisma.$disconnect()
  })
  beforeEach(async () => {
    await resetDb(prisma)
    sent = []
    ;[admin, kitchen] = await Promise.all([loginAs(app, 'admin'), loginAs(app, 'kitchen')])
  })

  describe('gestão de usuários', () => {
    const create = (body: object, token = admin) => api().post('/api/admin/users').set(bearer(token)).send(body)
    const patch = (id: string, body: object, token = admin) => api().patch(`/api/admin/users/${id}`).set(bearer(token)).send(body)

    it('só o admin lista e cria usuários; a lista nunca traz hash de senha', async () => {
      await api().get('/api/admin/users').expect(401)
      await api().get('/api/admin/users').set(bearer(kitchen)).expect(403)
      await create({ name: 'X Y', email: 'x@y.com', role: 'KITCHEN', password: 'senha-forte-2026' }, kitchen).expect(403)

      const list = await api().get('/api/admin/users').set(bearer(admin)).expect(200)
      expect(list.body.map((u: { email: string }) => u.email).sort()).toEqual(['admin@test.dev', 'cashier@test.dev', 'kitchen@test.dev'])
      expect(JSON.stringify(list.body)).not.toMatch(/passwordHash|\$2[aby]\$|tokenVersion/)
    })

    it('cria usuário que consegue entrar; recusa e-mail repetido (sem diferenciar maiúsculas), senha fraca e papel inválido', async () => {
      const ok = await create({ name: 'Maria Souza', email: 'Maria@Loja.com', role: 'CASHIER', password: 'senha-forte-2026' }).expect(201)
      expect(ok.body).toMatchObject({ email: 'maria@loja.com', role: 'CASHIER', active: true })
      await login('maria@loja.com', 'senha-forte-2026').expect(201)

      await create({ name: 'Outra', email: 'MARIA@loja.com', role: 'KITCHEN', password: 'senha-forte-2026' }).expect(409)
      await create({ name: 'Fraca', email: 'f@loja.com', role: 'KITCHEN', password: 'curta1' }).expect(400)
      await create({ name: 'Sem Letras', email: 'g@loja.com', role: 'KITCHEN', password: '1234567890123' }).expect(400)
      await create({ name: 'Papel', email: 'h@loja.com', role: 'SUPERUSER', password: 'senha-forte-2026' }).expect(400)
    })

    it('desativar derruba a sessão na hora, impede o login e pode ser desfeito', async () => {
      const id = await userId('kitchen@test.dev')
      await api().get('/api/orders').set(bearer(kitchen)).expect(200)

      await patch(id, { active: false }).expect(200)
      await api().get('/api/orders').set(bearer(kitchen)).expect(401) // sessão aberta cai
      const denied = await login('kitchen@test.dev', 'kitchen-pass').expect(401)
      expect(denied.body.message).toBe('E-mail ou senha incorretos') // sem revelar que a conta existe

      await patch(id, { active: true }).expect(200)
      await login('kitchen@test.dev', 'kitchen-pass').expect(201)
    })

    it('mudar o papel de alguém derruba as sessões dele', async () => {
      const id = await userId('kitchen@test.dev')
      await patch(id, { role: 'CASHIER' }).expect(200)
      await api().get('/api/orders').set(bearer(kitchen)).expect(401)
      const fresh = (await login('kitchen@test.dev', 'kitchen-pass').expect(201)).body
      expect(fresh.user.role).toBe('CASHIER')
    })

    it('renomear não derruba a sessão', async () => {
      const id = await userId('kitchen@test.dev')
      await patch(id, { name: 'Novo Nome' }).expect(200)
      await api().get('/api/orders').set(bearer(kitchen)).expect(200)
    })

    it('ninguém altera o próprio acesso, e o último admin ativo não pode ser removido', async () => {
      const me = await userId('admin@test.dev')
      await patch(me, { active: false }).expect(409)
      await patch(me, { role: 'KITCHEN' }).expect(409)
      await patch(me, { name: 'Admin Renomeado' }).expect(200) // nome pode

      // com um segundo admin, o primeiro pode rebaixá-lo; o último continua protegido
      await create({ name: 'Segundo Admin', email: 'admin2@test.dev', role: 'ADMIN', password: 'senha-forte-2026' }).expect(201)
      const admin2 = tokenOf(await login('admin2@test.dev', 'senha-forte-2026').expect(201))
      const id2 = await userId('admin2@test.dev')
      await patch(id2, { role: 'KITCHEN' }).expect(200) // sobra só o admin original
      await patch(me, { role: 'KITCHEN' }, admin2).expect(401) // admin2 foi rebaixado: a sessão dele já caiu
      await patch(id2, { role: 'ADMIN' }).expect(200)
      const admin2Again = tokenOf(await login('admin2@test.dev', 'senha-forte-2026').expect(201))
      await patch(me, { active: false }, admin2Again).expect(200) // agora há outro admin: pode
      await patch(id2, { active: false }, admin2Again).expect(409) // ele próprio
    })

    it('"enviar link de redefinição" manda o e-mail ao usuário', async () => {
      const id = await userId('kitchen@test.dev')
      await api().post(`/api/admin/users/${id}/send-reset`).set(bearer(admin)).expect(200)
      await sleep(100)
      expect(sent).toHaveLength(1)
      expect(sent[0].to).toBe('kitchen@test.dev')
      expect(sent[0].text).toMatch(/\?reset=[a-f0-9]{64}/)
      await api().post('/api/admin/users/nao-existe/send-reset').set(bearer(admin)).expect(404)
    })
  })

  describe('trocar a própria senha', () => {
    const change = (body: object, token = kitchen) => api().post('/api/auth/change-password').set(bearer(token)).send(body)

    it('exige a senha atual e segue a política de senha', async () => {
      await api().post('/api/auth/change-password').send({ currentPassword: 'kitchen-pass', newPassword: 'nova-senha-2026' }).expect(401)
      await change({ currentPassword: 'errada', newPassword: 'nova-senha-2026' }).expect(400)
      await change({ currentPassword: 'kitchen-pass', newPassword: 'curta1' }).expect(400)
      await change({ currentPassword: 'kitchen-pass', newPassword: 'kitchen-pass' }).expect(400) // igual à atual (e fraca)
      await login('kitchen@test.dev', 'kitchen-pass').expect(201) // nada mudou
    })

    it('troca a senha, derruba as outras sessões e devolve um token novo para esta continuar', async () => {
      const other = tokenOf(await login('kitchen@test.dev', 'kitchen-pass').expect(201))
      const res = await change({ currentPassword: 'kitchen-pass', newPassword: 'nova-senha-2026' }).expect(200)

      await login('kitchen@test.dev', 'kitchen-pass').expect(401)
      await login('kitchen@test.dev', 'nova-senha-2026').expect(201)
      await api().get('/api/orders').set(bearer(kitchen)).expect(401) // token antigo
      await api().get('/api/orders').set(bearer(other)).expect(401) // outra sessão aberta
      await api().get('/api/orders').set(bearer(tokenOf(res))).expect(200) // token novo vale (vem no cookie)
    })
  })

  describe('histórico de pedidos', () => {
    const order = (method: string, items: object[] = [{ productId: 'cola', qty: 1 }], extra: object = {}) =>
      api().post('/api/orders').send({ mode: 'DINE_IN', method, items, ...extra }).expect(201)
    const history = (qs = '', token = admin) => api().get(`/api/admin/orders${qs}`).set(bearer(token))

    /** Cria 3 pedidos em dias diferentes: card (ticket 1), cash (ticket 2) e pix (ticket 3). */
    const seed = async () => {
      const card = (await order('CARD', [{ productId: 'classic', qty: 1 }], { couponCode: 'PCT10', clientRef: 'AB12' })).body
      const cash = (await order('CASH', [{ productId: 'fries', qty: 2 }])).body
      const pix = (await order('PIX', [{ productId: 'cola', qty: 1 }])).body
      // 23:30 do dia 9 em São Paulo (= 02:30 UTC do dia 10), meio-dia do dia 10 e do dia 11
      await prisma.order.update({ where: { id: card.id }, data: { createdAt: new Date('2026-05-10T02:30:00Z') } })
      await prisma.order.update({ where: { id: cash.id }, data: { createdAt: new Date('2026-05-10T15:00:00Z') } })
      await prisma.order.update({ where: { id: pix.id }, data: { createdAt: new Date('2026-05-11T15:00:00Z') } })
      return { card, cash, pix }
    }

    it('só o admin acessa', async () => {
      await api().get('/api/admin/orders').expect(401)
      await history('', kitchen).expect(403)
      await api().get('/api/admin/orders/export.csv').set(bearer(kitchen)).expect(403)
    })

    it('lista do mais recente ao mais antigo, com total e paginação', async () => {
      const { card, cash, pix } = await seed()
      const all = (await history().expect(200)).body
      expect(all).toMatchObject({ total: 3, page: 1, pageSize: 25 })
      expect(all.items.map((o: { id: string }) => o.id)).toEqual([pix.id, cash.id, card.id])

      const p1 = (await history('?pageSize=2&page=1').expect(200)).body
      const p2 = (await history('?pageSize=2&page=2').expect(200)).body
      expect(p1.items).toHaveLength(2)
      expect(p2.items.map((o: { id: string }) => o.id)).toEqual([card.id])
      expect(p2.total).toBe(3)

      await history('?pageSize=101').expect(400)
      await history('?page=0').expect(400)
    })

    it('filtra por data no fuso de São Paulo (a meia-noite local, não a de UTC)', async () => {
      const { card, cash } = await seed()
      const ids = async (qs: string) => (await history(qs).expect(200)).body.items.map((o: { id: string }) => o.id)

      // 23:30 do dia 9 em SP (02:30Z do dia 10) pertence ao dia 9
      expect(await ids('?from=2026-05-09&to=2026-05-09')).toEqual([card.id])
      expect(await ids('?from=2026-05-10&to=2026-05-10')).toEqual([cash.id])
      expect(await ids('?from=2026-05-09&to=2026-05-10')).toHaveLength(2)
      expect(await ids('?from=2026-05-12')).toEqual([])
      await history('?from=09/05/2026').expect(400)
    })

    it('filtra por status, forma de pagamento e estorno', async () => {
      const { card } = await seed()
      expect((await history('?status=PAID').expect(200)).body.total).toBe(1)
      expect((await history('?status=CREATED').expect(200)).body.total).toBe(2)
      expect((await history('?method=CASH').expect(200)).body.items[0].payment.method).toBe('CASH')
      expect((await history('?method=PIX&status=CREATED').expect(200)).body.total).toBe(1)

      await api().patch(`/api/orders/${card.id}/status`).set(bearer(kitchen)).send({ status: 'CANCELED' }).expect(200)
      expect((await history('?refund=REFUNDED').expect(200)).body.items.map((o: { id: string }) => o.id)).toEqual([card.id])
      await history('?status=NADA').expect(400)
    })

    it('busca por senha, número, código offline, cupom e nome de produto', async () => {
      const { card, cash } = await seed()
      const ids = async (q: string) => (await history(`?q=${encodeURIComponent(q)}`).expect(200)).body.items.map((o: { id: string }) => o.id)

      expect(await ids('2')).toContain(cash.id) // senha 2
      expect(await ids(String(card.number))).toContain(card.id)
      expect(await ids('ab12')).toEqual([card.id]) // código offline, sem diferenciar maiúsculas
      expect(await ids('pct10')).toEqual([card.id]) // cupom
      expect(await ids('batata')).toEqual([cash.id]) // produto
      expect(await ids('nao-existe')).toEqual([])
    })

    describe('exportação CSV', () => {
      it('gera CSV em formato brasileiro (BOM UTF-8, ";" e vírgula decimal) com os filtros aplicados', async () => {
        await seed()
        const res = await csv().expect(200)
        expect(res.headers['content-type']).toContain('text/csv')
        expect(res.headers['content-disposition']).toContain('pedidos.csv')

        const text = Buffer.from(res.body as Buffer).toString('utf8')
        expect(text.charCodeAt(0)).toBe(0xfeff)
        const [header, ...rows] = text.trim().split('\r\n')
        expect(header).toContain('Senha;Pedido;Data/hora;Status')
        expect(rows).toHaveLength(3)
        expect(text).toContain('22,41') // classic 24,90 − 10% (cupom)
        expect(text).toContain('29,80') // 2 batatas
        expect(text).toContain('2x Batata')

        const filtered = await csv('?method=CASH').expect(200)
        expect(Buffer.from(filtered.body as Buffer).toString('utf8').trim().split('\r\n')).toHaveLength(2) // cabeçalho + 1
      })

      it('neutraliza fórmulas (CSV injection) em campos controlados por clientes', async () => {
        await prisma.coupon.create({ data: { code: '=CMD|CALC', type: 'PERCENT', value: 5 } })
        await order('CARD', [{ productId: 'classic', qty: 1 }], { couponCode: '=cmd|calc' })

        const res = await csv().expect(200)
        const text = Buffer.from(res.body as Buffer).toString('utf8')
        expect(text).toContain("'=CMD|CALC")
        expect(text).not.toMatch(/;=CMD/) // nenhuma célula começa com "="
      })
    })
  })
})
