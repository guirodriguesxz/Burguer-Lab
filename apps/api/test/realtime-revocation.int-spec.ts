import { AddressInfo } from 'node:net'
import { NestExpressApplication } from '@nestjs/platform-express'
import { PrismaClient } from '@prisma/client'
import { io, Socket } from 'socket.io-client'
import request from 'supertest'
import { bearer, createApp, loginAs, resetDb, sleep, tokenOf } from './helpers'

/** WebSocket real: o acesso em tempo real também precisa ser cortado quando a sessão é revogada. */
describe('tempo real e revogação de acesso (integração)', () => {
  let app: NestExpressApplication
  let prisma: PrismaClient
  let url: string
  let admin: string
  let kitchen: string
  const sockets: Socket[] = []

  const connect = (token?: string) => {
    const s = io(url, { auth: token ? { token } : {}, transports: ['websocket'], reconnection: false })
    sockets.push(s)
    return s
  }
  const connected = (s: Socket) => new Promise<void>((res, rej) => (s.once('connect', res), s.once('connect_error', rej)))
  const disconnected = (s: Socket, ms = 2000) =>
    new Promise<boolean>((res) => {
      if (s.disconnected) return res(true)
      const t = setTimeout(() => res(false), ms)
      s.once('disconnect', () => (clearTimeout(t), res(true)))
    })
  const orderEvents = (s: Socket) => {
    const got: unknown[] = []
    s.on('order:created', (o) => got.push(o))
    return got
  }
  const placeOrder = () =>
    request(app.getHttpServer()).post('/api/orders').send({ mode: 'DINE_IN', method: 'CARD', items: [{ productId: 'cola', qty: 1 }] }).expect(201)

  beforeAll(async () => {
    prisma = new PrismaClient()
    app = await createApp()
    await app.listen(0)
    url = `http://localhost:${(app.getHttpServer().address() as AddressInfo).port}`
  })
  afterAll(async () => {
    sockets.forEach((s) => s.close())
    await app.close()
    await prisma.$disconnect()
  })
  beforeEach(async () => {
    await resetDb(prisma)
    ;[admin, kitchen] = await Promise.all([loginAs(app, 'admin'), loginAs(app, 'kitchen')])
  })
  afterEach(() => sockets.splice(0).forEach((s) => s.close()))

  it('só a equipe autenticada recebe pedidos; conexão pública e token inválido não', async () => {
    const staff = connect(kitchen)
    const anon = connect()
    await Promise.all([connected(staff), connected(anon)])
    const staffGot = orderEvents(staff)
    const anonGot = orderEvents(anon)
    const bad = connect('token.invalido.aqui')
    await connected(bad).catch(() => undefined)

    await placeOrder()
    await sleep(300)
    expect(staffGot).toHaveLength(1)
    expect(anonGot).toHaveLength(0) // o totem/tela pública nunca recebe dados de pedido
    expect(await disconnected(bad)).toBe(true) // token inválido é desconectado
  })

  it('desativar o usuário derruba o socket aberto e ele para de receber pedidos', async () => {
    const s = connect(kitchen)
    await connected(s)
    const got = orderEvents(s)
    await placeOrder()
    await sleep(200)
    expect(got).toHaveLength(1)

    const id = (await prisma.user.findUniqueOrThrow({ where: { email: 'kitchen@test.dev' } })).id
    await request(app.getHttpServer()).patch(`/api/admin/users/${id}`).set(bearer(admin)).send({ active: false }).expect(200)

    expect(await disconnected(s)).toBe(true)
    await placeOrder()
    await sleep(200)
    expect(got).toHaveLength(1) // não recebeu o segundo
  })

  it('mudar o papel derruba o socket; reconectar com o token antigo é recusado', async () => {
    const s = connect(kitchen)
    await connected(s)
    const id = (await prisma.user.findUniqueOrThrow({ where: { email: 'kitchen@test.dev' } })).id
    await request(app.getHttpServer()).patch(`/api/admin/users/${id}`).set(bearer(admin)).send({ role: 'CASHIER' }).expect(200)
    expect(await disconnected(s)).toBe(true)

    const again = connect(kitchen) // token com a versão antiga
    await connected(again).catch(() => undefined)
    expect(await disconnected(again)).toBe(true)
  })

  it('trocar a senha derruba as conexões das outras sessões, mas não a de quem trocou', async () => {
    const mine = connect(kitchen)
    const mineUp = connected(mine) // arma a espera já: a conexão acontece enquanto o login abaixo roda
    const loginRes = await request(app.getHttpServer()).post('/api/auth/login').send({ email: 'kitchen@test.dev', password: 'kitchen-pass' }).expect(201)
    const otherToken = tokenOf(loginRes) // outra tela, outra sessão
    const other = connect(otherToken)
    await Promise.all([mineUp, connected(other)])

    await request(app.getHttpServer())
      .post('/api/auth/change-password')
      .set(bearer(kitchen))
      .send({ currentPassword: 'kitchen-pass', newPassword: 'nova-senha-2026' })
      .expect(200)

    expect(await disconnected(other)).toBe(true) // a outra sessão caiu
    await sleep(300)
    expect(mine.connected).toBe(true) // esta continua (recebe o cookie novo na mesma resposta)
  })

  it('renomear não derruba a conexão', async () => {
    const s = connect(kitchen)
    await connected(s)
    const id = (await prisma.user.findUniqueOrThrow({ where: { email: 'kitchen@test.dev' } })).id
    await request(app.getHttpServer()).patch(`/api/admin/users/${id}`).set(bearer(admin)).send({ name: 'Outro Nome' }).expect(200)
    await sleep(300)
    expect(s.connected).toBe(true)
  })
})
