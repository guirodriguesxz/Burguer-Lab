import { Writable } from 'node:stream'
import express from 'express'
import pinoHttp from 'pino-http'
import request from 'supertest'
import { buildPinoHttpOptions } from './pino-options'

/** Sobe um Express mínimo com o mesmo middleware de log da aplicação e devolve as linhas JSON emitidas. */
function setup() {
  const lines: Record<string, any>[] = []
  const stream = new Writable({
    write(chunk, _enc, cb) {
      for (const l of chunk.toString().split('\n').filter(Boolean)) lines.push(JSON.parse(l))
      cb()
    },
  })
  const app = express()
  app.use(pinoHttp(buildPinoHttpOptions({ LOG_LEVEL: 'info' } as NodeJS.ProcessEnv), stream))
  app.get('/api/health', (_req, res) => void res.json({ ok: true }))
  app.get('/api/orders', (req, res) => {
    ;(req as any).user = { sub: 'user-42' } // o guard de autenticação faria isso
    res.json([])
  })
  app.get('/api/boom', (_req, res) => void res.status(500).json({}))
  app.get('/api/missing', (_req, res) => void res.status(404).json({}))
  return { app, lines }
}

describe('logs estruturados', () => {
  it('uma linha JSON por requisição, com id de correlação, status e duração', async () => {
    const { app, lines } = setup()
    const res = await request(app).get('/api/orders')
    await new Promise((r) => setTimeout(r, 20))

    expect(lines).toHaveLength(1)
    expect(lines[0]).toMatchObject({ level: 30, msg: 'request completed', userId: 'user-42', req: { method: 'GET', url: '/api/orders' }, res: { statusCode: 200 } })
    expect(typeof lines[0].responseTime).toBe('number')
    expect(lines[0].req.id).toBe(res.headers['x-request-id']) // o mesmo id vai no log e na resposta
  })

  it('nunca registra cookie, Authorization nem a query string (que pode ter token)', async () => {
    const { app, lines } = setup()
    await request(app).get('/api/orders?reset=abcdef0123456789&status=PAID').set('Authorization', 'Bearer segredo.jwt.token').set('Cookie', 'bl_session=segredo-cookie')
    await new Promise((r) => setTimeout(r, 20))

    const dump = JSON.stringify(lines)
    expect(dump).not.toMatch(/segredo|abcdef0123456789|Bearer|bl_session/)
    expect(lines[0].req.url).toBe('/api/orders')
  })

  it('aproveita o X-Request-ID de quem chamou, mas só se for seguro; senão gera outro', async () => {
    const { app, lines } = setup()
    const ok = await request(app).get('/api/orders').set('X-Request-ID', 'meu-id-123')
    expect(ok.headers['x-request-id']).toBe('meu-id-123')

    const evil = await request(app).get('/api/orders').set('X-Request-ID', 'a b\tc<script>')
    expect(evil.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/)
    const tooLong = await request(app).get('/api/orders').set('X-Request-ID', 'x'.repeat(200))
    expect(tooLong.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/)
    await new Promise((r) => setTimeout(r, 20))
    expect(lines.map((l) => l.req.id)).toEqual(['meu-id-123', evil.headers['x-request-id'], tooLong.headers['x-request-id']])
  })

  it('o nível acompanha o resultado: 2xx info, 4xx warn, 5xx error; saúde não gera log', async () => {
    const { app, lines } = setup()
    await request(app).get('/api/orders')
    await request(app).get('/api/missing')
    await request(app).get('/api/boom')
    await request(app).get('/api/health')
    await new Promise((r) => setTimeout(r, 20))

    expect(lines.map((l) => [l.res.statusCode, l.level])).toEqual([
      [200, 30],
      [404, 40],
      [500, 50],
    ])
  })

  it('em teste fica silencioso por padrão; LOG_LEVEL controla o resto', () => {
    expect(buildPinoHttpOptions({ NODE_ENV: 'test' } as NodeJS.ProcessEnv).level).toBe('silent')
    expect(buildPinoHttpOptions({ NODE_ENV: 'production' } as NodeJS.ProcessEnv).level).toBe('info')
    expect(buildPinoHttpOptions({ NODE_ENV: 'production', LOG_LEVEL: 'warn' } as NodeJS.ProcessEnv).level).toBe('warn')
  })
})
