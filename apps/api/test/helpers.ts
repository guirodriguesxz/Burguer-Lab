import { NestExpressApplication } from '@nestjs/platform-express'
import { Test, TestingModuleBuilder } from '@nestjs/testing'
import { PrismaClient } from '@prisma/client'
import * as bcrypt from 'bcryptjs'
import request from 'supertest'

/** Sobe a aplicação real (mesmas regras de produção), sem abrir porta. */
export async function createApp(customize?: (builder: TestingModuleBuilder) => TestingModuleBuilder) {
  // import dinâmico: garante que as variáveis de ambiente do teste já foram definidas
  const { AppModule } = await import('../src/app.module')
  const { configureApp } = await import('../src/app.setup')
  const builder = Test.createTestingModule({ imports: [AppModule] })
  const moduleRef = await (customize ? customize(builder) : builder).compile()
  const app = moduleRef.createNestApplication<NestExpressApplication>({ rawBody: true })
  configureApp(app)
  await app.init()
  return app
}

const burgerExtra = (id: string, name: string, priceCents: number, productId: string) => ({ id, name, priceCents, productId })

/** Limpa o banco e recria um cardápio pequeno e previsível. */
export async function resetDb(prisma: PrismaClient) {
  await prisma.$executeRawUnsafe(
    'TRUNCATE "OrderEvent","Payment","OrderItem","Order","Extra","Product","Category","Coupon","User" RESTART IDENTITY CASCADE',
  )
  await prisma.category.createMany({
    data: [
      { id: 'burgers', label: 'Burgers', emoji: '🍔', position: 0 },
      { id: 'sides', label: 'Sides', emoji: '🍟', position: 1 },
      { id: 'drinks', label: 'Drinks', emoji: '🥤', position: 2 },
      { id: 'desserts', label: 'Desserts', emoji: '🍨', position: 3 },
    ],
  })
  await prisma.product.createMany({
    data: [
      { id: 'classic', name: 'Clássico', description: '-', priceCents: 2490, emoji: '🍔', categoryId: 'burgers', stock: 10, removable: ['Cebola'] },
      { id: 'fries', name: 'Batata', description: '-', priceCents: 1490, emoji: '🍟', categoryId: 'sides', stock: 5, removable: [] },
      { id: 'cola', name: 'Refri', description: '-', priceCents: 890, emoji: '🥤', categoryId: 'drinks', stock: null, removable: [] },
      { id: 'brownie', name: 'Brownie', description: '-', priceCents: 1590, emoji: '🍫', categoryId: 'desserts', stock: 1, removable: [] },
      { id: 'paused', name: 'Pausado', description: '-', priceCents: 1000, emoji: '⏸️', categoryId: 'desserts', stock: 9, available: false, removable: [] },
    ],
  })
  await prisma.extra.createMany({ data: [burgerExtra('classic-bacon', 'Bacon', 400, 'classic')] })
  await prisma.user.createMany({
    data: [
      { email: 'admin@test.dev', name: 'Admin', role: 'ADMIN', passwordHash: await bcrypt.hash('admin-pass', 4) },
      { email: 'kitchen@test.dev', name: 'Cozinha', role: 'KITCHEN', passwordHash: await bcrypt.hash('kitchen-pass', 4) },
      { email: 'cashier@test.dev', name: 'Caixa', role: 'CASHIER', passwordHash: await bcrypt.hash('cashier-pass', 4) },
    ],
  })
  await prisma.coupon.createMany({
    data: [
      { code: 'PCT10', type: 'PERCENT', value: 10 },
      { code: 'FIXED5', type: 'FIXED', value: 500, minOrderCents: 3000 },
      { code: 'ONCE', type: 'PERCENT', value: 50, maxUses: 1 },
    ],
  })
}

const CREDS = {
  admin: { email: 'admin@test.dev', password: 'admin-pass' },
  kitchen: { email: 'kitchen@test.dev', password: 'kitchen-pass' },
  cashier: { email: 'cashier@test.dev', password: 'cashier-pass' },
}

export async function loginAs(app: NestExpressApplication, who: keyof typeof CREDS) {
  const creds = CREDS[who]
  const res = await request(app.getHttpServer()).post('/api/auth/login').send(creds).expect(201)
  return res.body.token as string
}

export const bearer = (token: string) => ({ Authorization: `Bearer ${token}` })
export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
