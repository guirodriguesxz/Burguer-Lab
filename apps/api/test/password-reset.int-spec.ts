import { NestExpressApplication } from '@nestjs/platform-express'
import { PrismaClient } from '@prisma/client'
import request from 'supertest'
import { Mail, Mailer } from '../src/mail/mailer'
import { bearer, createApp, resetDb, sleep, tokenOf } from './helpers'

describe('redefinição de senha (integração)', () => {
  let app: NestExpressApplication
  let prisma: PrismaClient
  let sent: Mail[]

  const api = () => request(app.getHttpServer())
  const forgot = (email: string) => api().post('/api/auth/forgot-password').send({ email })
  const reset = (token: string, password: string) => api().post('/api/auth/reset-password').send({ token, password })
  const login = (email: string, password: string) => api().post('/api/auth/login').send({ email, password })
  const lastToken = () => {
    const m = sent.at(-1)?.text.match(/\?reset=([a-f0-9]{64})/)
    if (!m) throw new Error('nenhum link de redefinição enviado')
    return m[1]
  }
  // o envio é assíncrono (não bloqueia a resposta): espera o e-mail chegar
  const waitForMail = async (count: number) => {
    for (let i = 0; i < 50 && sent.length < count; i++) await sleep(20)
  }

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
  })

  it('responde igual para e-mail existente e inexistente, e só envia e-mail para quem existe', async () => {
    const a = await forgot('admin@test.dev').expect(202)
    const b = await forgot('ninguem@test.dev').expect(202)
    expect(a.body).toEqual(b.body)
    await waitForMail(1)
    await sleep(100)
    expect(sent).toHaveLength(1)
    expect(sent[0].to).toBe('admin@test.dev')
  })

  it('fluxo completo: nova senha vale, a antiga não, e a sessão aberta é derrubada', async () => {
    const oldSession = tokenOf(await login('admin@test.dev', 'admin-pass').expect(201))
    await api().get('/api/admin/products').set(bearer(oldSession)).expect(200)

    await forgot('admin@test.dev').expect(202)
    await waitForMail(1)
    await reset(lastToken(), 'nova-senha-2026').expect(200)

    await login('admin@test.dev', 'admin-pass').expect(401)
    const fresh = tokenOf(await login('admin@test.dev', 'nova-senha-2026').expect(201))
    await api().get('/api/admin/products').set(bearer(fresh)).expect(200)

    // trocar a senha invalida os tokens emitidos antes
    await api().get('/api/admin/products').set(bearer(oldSession)).expect(401)
  })

  it('o token funciona uma vez só e é guardado apenas como hash', async () => {
    await forgot('admin@test.dev').expect(202)
    await waitForMail(1)
    const token = lastToken()

    const stored = await prisma.passwordResetToken.findMany()
    expect(stored).toHaveLength(1)
    expect(stored[0].tokenHash).not.toBe(token)
    expect(JSON.stringify(stored)).not.toContain(token)

    await reset(token, 'nova-senha-2026').expect(200)
    await reset(token, 'outra-senha-2026').expect(400) // reutilizar
  })

  it('recusa senha fraca sem consumir o token, e token expirado ou malformado', async () => {
    await forgot('admin@test.dev').expect(202)
    await waitForMail(1)
    const token = lastToken()

    await reset(token, 'curta1').expect(400)
    await reset(token, 'somente-letras-aqui').expect(400)
    await reset(token, 'nova-senha-2026').expect(200) // o token continuava válido

    await reset('nao-e-um-token', 'nova-senha-2026').expect(400)
    await reset('a'.repeat(64), 'nova-senha-2026').expect(400) // bem formado, mas inexistente

    await forgot('admin@test.dev').expect(202)
    await waitForMail(2)
    await prisma.passwordResetToken.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } })
    await reset(lastToken(), 'outra-senha-2026').expect(400)
  })

  it('um novo pedido invalida o link anterior', async () => {
    await forgot('admin@test.dev').expect(202)
    await waitForMail(1)
    const first = lastToken()
    await forgot('admin@test.dev').expect(202)
    await waitForMail(2)
    const second = lastToken()

    expect(second).not.toBe(first)
    await reset(first, 'nova-senha-2026').expect(400)
    await reset(second, 'nova-senha-2026').expect(200)
  })

  it('limita quantos pedidos de redefinição um mesmo e-mail recebe por hora', async () => {
    for (let i = 0; i < 5; i++) await forgot('admin@test.dev').expect(202)
    await sleep(200)
    expect(sent.length).toBe(3)
  })

  it('dois cliques simultâneos no mesmo link: só um redefine', async () => {
    await forgot('admin@test.dev').expect(202)
    await waitForMail(1)
    const token = lastToken()
    const results = await Promise.all([reset(token, 'senha-a-2026x'), reset(token, 'senha-b-2026x')])
    expect(results.map((r) => r.status).sort()).toEqual([200, 400])
  })
})
