import { NestExpressApplication } from '@nestjs/platform-express'
import { PrismaClient } from '@prisma/client'
import request from 'supertest'
import { ErrorReporter } from '../src/observability/error-reporter'
import { PrismaService } from '../src/prisma/prisma.service'
import { bearer, createApp, loginAs, resetDb } from './helpers'

describe('métricas e relatório de erros (integração)', () => {
  let app: NestExpressApplication
  let prisma: PrismaClient
  let admin: string
  const capture = jest.fn()

  const api = () => request(app.getHttpServer())
  const scrape = () => api().get('/api/metrics').set('Authorization', 'Bearer metrics-secret')

  /** Valor de uma série (ex.: orders_created_total{method="CARD"}) no texto do Prometheus. */
  const value = (text: string, series: string) => {
    const line = text.split('\n').find((l) => l.startsWith(`${series} `))
    return line ? Number(line.split(' ')[1]) : 0
  }

  beforeAll(async () => {
    prisma = new PrismaClient()
    app = await createApp((b) => b.overrideProvider(ErrorReporter).useValue({ capture }))
  })
  afterAll(async () => {
    await app.close()
    await prisma.$disconnect()
  })
  beforeEach(async () => {
    await resetDb(prisma)
    capture.mockReset()
    process.env.METRICS_TOKEN = 'metrics-secret'
    admin = await loginAs(app, 'admin')
  })
  afterEach(() => {
    delete process.env.METRICS_TOKEN
  })

  describe('métricas (Prometheus)', () => {
    it('fica desligado (404) sem METRICS_TOKEN e exige o token quando ligado', async () => {
      delete process.env.METRICS_TOKEN
      await api().get('/api/metrics').expect(404)
      await api().get('/api/metrics').set('Authorization', 'Bearer qualquer').expect(404)

      process.env.METRICS_TOKEN = 'metrics-secret'
      await api().get('/api/metrics').expect(401)
      await api().get('/api/metrics').set('Authorization', 'Bearer errado').expect(401)
      await api().get('/api/metrics').set('Authorization', 'Bearer metrics-secre').expect(401) // quase igual
      await api().get('/api/metrics').set('Authorization', 'metrics-secret').expect(401) // sem "Bearer"
      const ok = await scrape().expect(200)
      expect(ok.headers['content-type']).toMatch(/text\/plain/)
    })

    it('traz métricas do processo e de requisições HTTP', async () => {
      await api().get('/api/menu').expect(200)
      const text = (await scrape().expect(200)).text
      expect(text).toContain('burgerlab_process_cpu_user_seconds_total')
      expect(text).toContain('burgerlab_nodejs_eventloop_lag_seconds')
      expect(text).toMatch(/http_request_duration_seconds_count\{method="GET",route="\/api\/menu",status="200"\} \d+/)
    })

    it('rotulagem por padrão de rota: ids e URLs desconhecidas não criam séries novas', async () => {
      const order = (await api().post('/api/orders').send({ mode: 'DINE_IN', method: 'CARD', items: [{ productId: 'cola', qty: 1 }] }).expect(201)).body
      await api().get(`/api/orders/${order.id}/status`).expect(200)
      await api().get('/api/rota/que/nao/existe-123').expect(404)

      const text = (await scrape().expect(200)).text
      expect(text).toContain('route="/api/orders/:id/status"')
      expect(text).toContain('route="other"')
      expect(text).not.toContain(order.id) // nenhum id vaza para os rótulos
      expect(text).not.toContain('existe-123')
    })

    it('contadores de negócio: pedidos, pagamentos, estornos e logins', async () => {
      const before = (await scrape().expect(200)).text
      const base = (series: string) => value(before, series)

      const card = (await api().post('/api/orders').send({ mode: 'DINE_IN', method: 'CARD', items: [{ productId: 'cola', qty: 1 }] }).expect(201)).body
      const cash = (await api().post('/api/orders').send({ mode: 'DINE_IN', method: 'CASH', items: [{ productId: 'cola', qty: 1 }] }).expect(201)).body
      await api().post(`/api/orders/${cash.id}/confirm-cash`).set(bearer(admin)).expect(200)
      await api().patch(`/api/orders/${card.id}/status`).set(bearer(admin)).send({ status: 'CANCELED' }).expect(200) // estorna
      await api().post('/api/auth/login').send({ email: 'admin@test.dev', password: 'errada' }).expect(401)

      const after = (await scrape().expect(200)).text
      const delta = (series: string) => value(after, series) - base(series)
      expect(delta('orders_created_total{method="CARD"}')).toBe(1)
      expect(delta('orders_created_total{method="CASH"}')).toBe(1)
      expect(delta('payments_confirmed_total{method="CARD"}')).toBe(1)
      expect(delta('payments_confirmed_total{method="CASH"}')).toBe(1)
      expect(delta('refunds_total{result="refunded"}')).toBe(1)
      expect(delta('logins_total{result="failure"}')).toBe(1)
    })

    it('nunca expõe dados de pessoas ou segredos nas métricas', async () => {
      await api().post('/api/auth/login').send({ email: 'admin@test.dev', password: 'admin-pass' }).expect(201)
      await api().post('/api/auth/login').send({ email: 'ninguem@test.dev', password: 'senha-secreta-xyz' }).expect(401)
      const text = (await scrape().expect(200)).text
      expect(text).not.toMatch(/admin@test\.dev|ninguem@|senha-secreta|admin-pass|metrics-secret|eyJ|bl_session/)
    })
  })

  describe('relatório de erros', () => {
    const breakDatabase = () => jest.spyOn(app.get(PrismaService).product, 'findMany').mockRejectedValue(new Error('conexão com o banco perdida'))

    it('erro inesperado (500) é reportado com o id da requisição e a rota, e o cliente não vê detalhes', async () => {
      const spy = breakDatabase()
      let res
      try {
        res = await api().get('/api/menu').set('X-Request-ID', 'req-abc-123')
      } finally {
        spy.mockRestore()
      }

      expect(res.status).toBe(500)
      expect(res.headers['x-request-id']).toBe('req-abc-123')
      expect(res.body).toEqual({ statusCode: 500, message: 'Internal server error' }) // sem stack, sem mensagem interna
      expect(JSON.stringify(res.body)).not.toMatch(/banco|stack|Error:/)

      expect(capture).toHaveBeenCalledTimes(1)
      const [error, context] = capture.mock.calls[0]
      expect(error).toBeInstanceOf(Error)
      expect((error as Error).message).toBe('conexão com o banco perdida')
      expect(context).toMatchObject({ requestId: 'req-abc-123', route: '/api/menu' })
    })

    it('inclui quem estava logado no relatório (só o id, nunca e-mail)', async () => {
      const spy = jest.spyOn(app.get(PrismaService).product, 'findMany').mockRejectedValue(new Error('falha'))
      try {
        await api().get('/api/admin/products').set(bearer(admin)).expect(500)
      } finally {
        spy.mockRestore()
      }
      const adminId = (await prisma.user.findUniqueOrThrow({ where: { email: 'admin@test.dev' } })).id
      expect(capture.mock.calls[0][1]).toMatchObject({ userId: adminId, route: '/api/admin/products' })
      expect(JSON.stringify(capture.mock.calls[0][1])).not.toContain('@')
    })

    it('erros esperados do cliente (4xx) nunca são reportados', async () => {
      await api().get('/api/orders/id-que-nao-existe/status').expect(404)
      await api().post('/api/orders').send({ mode: 'NADA' }).expect(400)
      await api().get('/api/admin/products').expect(401)
      const kitchen = await loginAs(app, 'kitchen') // antes de criar a requisição: o supertest compartilha o servidor temporário
      await api().get('/api/admin/products').set(bearer(kitchen)).expect(403)
      await api().post('/api/orders').send({ mode: 'DINE_IN', method: 'CARD', items: [{ productId: 'brownie', qty: 5 }] }).expect(409)
      expect(capture).not.toHaveBeenCalled()
    })

    it('uma falha ao enviar o relatório não piora a resposta', async () => {
      capture.mockImplementationOnce(() => {
        throw new Error('Sentry fora do ar')
      })
      const spy = breakDatabase()
      try {
        // a falha do reporter é do monitoramento: o cliente ainda recebe a resposta 500 normal
        const res = await api().get('/api/menu')
        expect([500]).toContain(res.status)
      } finally {
        spy.mockRestore()
      }
    })
  })

  it('o id de correlação é devolvido em todas as respostas (e gerado quando não vem)', async () => {
    const echoed = await api().get('/api/menu').set('X-Request-ID', 'meu-id-9')
    expect(echoed.headers['x-request-id']).toBe('meu-id-9')
    const generated = await api().get('/api/menu')
    expect(generated.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/)
  })
})
