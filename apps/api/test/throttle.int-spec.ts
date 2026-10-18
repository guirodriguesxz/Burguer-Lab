// Precisa vir antes de a aplicação ser carregada (o limite é lido na definição do controller).
process.env.LOGIN_RATE_LIMIT = '4'

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
})
