import { execSync } from 'node:child_process'
import { gzipSync } from 'node:zlib'
import { NestExpressApplication } from '@nestjs/platform-express'
import { PrismaClient } from '@prisma/client'
import request from 'supertest'
import { BackupError, createBackup, restoreBackup } from '../src/backup/backup'
import { BackupCryptoError, encryptBackup } from '../src/backup/crypto'
import { bearer, createApp, loginAs, resetDb } from './helpers'

const PASS = 'senha-de-backup-bem-longa-2026'
const sourceUrl = process.env.DATABASE_URL!
const dbName = new URL(sourceUrl).pathname.slice(1)
const targetName = `${dbName}_restore`
const targetUrl = sourceUrl.replace(`/${dbName}`, `/${targetName}`)

describe('backup e restauração (integração)', () => {
  let app: NestExpressApplication
  let source: PrismaClient
  let target: PrismaClient

  const api = () => request(app.getHttpServer())
  const TABLES = ['category', 'product', 'extra', 'user', 'coupon', 'dailyCounter', 'order', 'orderItem', 'payment', 'orderEvent', 'auditLog'] as const
  const dump = async (db: PrismaClient, name: string) =>
    JSON.stringify(await (db as any)[name].findMany({ orderBy: name === 'dailyCounter' ? { date: 'asc' } : { id: 'asc' } }))
  const emptyTarget = () =>
    target.$executeRawUnsafe(
      'TRUNCATE "OrderEvent","Payment","OrderItem","Order","DailyCounter","AuditLog","Extra","Product","Category","Coupon","User","RevokedToken","PasswordResetToken" RESTART IDENTITY CASCADE',
    )

  beforeAll(async () => {
    source = new PrismaClient()
    // banco de destino separado, com o mesmo schema (migrações reais)
    const admin = new PrismaClient({ datasources: { db: { url: sourceUrl.replace(`/${dbName}`, '/postgres') } } })
    try {
      await admin.$executeRawUnsafe(`CREATE DATABASE "${targetName}"`)
    } catch {
      // já existe
    } finally {
      await admin.$disconnect()
    }
    execSync('npx prisma migrate deploy', { cwd: __dirname + '/..', env: { ...process.env, DATABASE_URL: targetUrl }, stdio: 'pipe' })
    target = new PrismaClient({ datasources: { db: { url: targetUrl } } })
    app = await createApp()
  })
  afterAll(async () => {
    await app.close()
    await source.$disconnect()
    await target.$disconnect()
  })
  beforeEach(async () => {
    await resetDb(source)
    await emptyTarget()
  })

  /** Monta um banco "com vida": pedidos de cada forma de pagamento, cupom usado, cancelamento e auditoria. */
  async function seedLife() {
    const admin = await loginAs(app, 'admin')
    const place = (method: string, extra: object = {}) =>
      api().post('/api/orders').send({ mode: 'DINE_IN', method, items: [{ productId: 'classic', qty: 1, extraIds: ['classic-bacon'], removed: ['Cebola'] }], ...extra }).expect(201)
    await place('CARD', { couponCode: 'PCT10', clientRef: 'AB12' })
    const cash = (await place('CASH')).body
    await place('PIX')
    await api().post(`/api/orders/${cash.id}/confirm-cash`).set(bearer(admin)).expect(200)
    await api().patch(`/api/orders/${cash.id}/status`).set(bearer(admin)).send({ status: 'CANCELED' }).expect(200)
    await api().patch('/api/admin/products/fries').set(bearer(admin)).send({ priceCents: 1600 }).expect(200)
  }

  it('ida e volta: o banco restaurado é idêntico ao original, tabela por tabela', async () => {
    await seedLife()
    const { file, header } = await createBackup(source, PASS)
    expect(header.counts.Order).toBe(3)
    expect(header.counts.AuditLog).toBeGreaterThan(0)

    const { restored } = await restoreBackup(target, file, PASS)
    expect(restored).toEqual(header.counts)
    for (const t of TABLES) expect(await dump(target, t)).toEqual(await dump(source, t))
  })

  it('o arquivo é criptografado: nada de e-mails, hashes ou nomes legíveis', async () => {
    await seedLife()
    const { file } = await createBackup(source, PASS)
    const text = file.toString('latin1')
    expect(text).not.toMatch(/admin@test\.dev|kitchen@test\.dev|\$2[aby]\$|Clássico|AB12/)
  })

  it('o próximo pedido depois do restore continua a numeração (sem repetir número)', async () => {
    await seedLife()
    const maxNumber = (await source.order.aggregate({ _max: { number: true } }))._max.number!
    const { file } = await createBackup(source, PASS)
    await restoreBackup(target, file, PASS)

    const next = await target.order.create({ data: { mode: 'DINE_IN', totalCents: 100 } })
    expect(next.number).toBe(maxNumber + 1)
  })

  it('páginas grandes: mais de 5 mil linhas numa tabela voltam completas', async () => {
    await source.auditLog.createMany({ data: Array.from({ length: 5200 }, (_, i) => ({ action: `teste.${i}`, at: new Date(Date.UTC(2026, 0, 1, 0, 0, 0, i)) })) })
    const { file, header } = await createBackup(source, PASS)
    expect(header.counts.AuditLog).toBe(5200)
    await restoreBackup(target, file, PASS)
    expect(await target.auditLog.count()).toBe(5200)
  }, 120_000)

  it('recusa banco de destino com dados (a menos que --force, que substitui tudo)', async () => {
    await seedLife()
    const { file } = await createBackup(source, PASS)
    await restoreBackup(target, file, PASS)

    await target.category.create({ data: { id: 'lixo', label: 'Lixo', emoji: '🗑️' } })
    await expect(restoreBackup(target, file, PASS)).rejects.toThrow(/não está vazio/)
    expect(await target.category.count({ where: { id: 'lixo' } })).toBe(1) // nada foi mexido

    await restoreBackup(target, file, PASS, { force: true })
    expect(await target.category.count({ where: { id: 'lixo' } })).toBe(0) // --force substituiu
    for (const t of TABLES) expect(await dump(target, t)).toEqual(await dump(source, t))
  })

  it('senha errada e arquivo adulterado são recusados sem tocar no banco', async () => {
    await seedLife()
    const { file } = await createBackup(source, PASS)

    await expect(restoreBackup(target, file, 'outra-senha-bem-longa-123')).rejects.toThrow(BackupCryptoError)
    const tampered = Buffer.from(file)
    tampered[tampered.length - 40] ^= 0xff
    await expect(restoreBackup(target, tampered, PASS)).rejects.toThrow(BackupCryptoError)
    expect(await target.user.count()).toBe(0)
  })

  it('recusa restaurar num banco desatualizado (faltam migrações)', async () => {
    await seedLife()
    const { file } = await createBackup(source, PASS)
    const last = (await target.$queryRaw<{ migration_name: string }[]>`SELECT migration_name FROM "_prisma_migrations" ORDER BY migration_name DESC LIMIT 1`)[0].migration_name
    await target.$executeRaw`UPDATE "_prisma_migrations" SET finished_at = NULL WHERE migration_name = ${last}`
    try {
      await expect(restoreBackup(target, file, PASS)).rejects.toThrow(/desatualizado/)
      expect(await target.user.count()).toBe(0)
    } finally {
      await target.$executeRaw`UPDATE "_prisma_migrations" SET finished_at = NOW() WHERE migration_name = ${last}`
    }
  })

  it('tudo ou nada: um erro no meio da restauração desfaz o que já tinha entrado', async () => {
    const migrations = (await target.$queryRaw<{ migration_name: string }[]>`SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL`).map((m) => m.migration_name)
    const lines = [
      { header: { format: 1, createdAt: new Date().toISOString(), migrations, counts: { Category: 1, Payment: 1 } } },
      { t: 'Category', r: { id: 'c1', label: 'Teste', emoji: '🍔', position: 0 } },
      // pagamento de um pedido que não existe: viola a chave estrangeira depois de a categoria já ter entrado
      { t: 'Payment', r: { id: 'p1', orderId: 'pedido-inexistente', method: 'CARD', amountCents: 100, status: 'PAID', createdAt: new Date().toISOString() } },
    ]
    const evil = encryptBackup(gzipSync(Buffer.from(lines.map((l) => JSON.stringify(l)).join('\n'))), PASS)

    await expect(restoreBackup(target, evil, PASS)).rejects.toThrow()
    expect(await target.category.count()).toBe(0) // a categoria que entrou antes foi desfeita
  })

  it('a conferência final pega divergência entre o que o backup diz e o que entrou', async () => {
    const migrations = (await target.$queryRaw<{ migration_name: string }[]>`SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL`).map((m) => m.migration_name)
    const lines = [
      { header: { format: 1, createdAt: new Date().toISOString(), migrations, counts: { Category: 2 } } }, // diz 2, vem 1
      { t: 'Category', r: { id: 'c1', label: 'Teste', emoji: '🍔', position: 0 } },
    ]
    const inconsistent = encryptBackup(gzipSync(Buffer.from(lines.map((l) => JSON.stringify(l)).join('\n'))), PASS)
    await expect(restoreBackup(target, inconsistent, PASS)).rejects.toThrow(BackupError)
    expect(await target.category.count()).toBe(0)
  })

  it('sessões revogadas e tokens de senha não entram no backup (transitórios e sensíveis)', async () => {
    await seedLife()
    await source.revokedToken.create({ data: { jti: 'x', expiresAt: new Date(Date.now() + 3600_000) } })
    const user = await source.user.findFirstOrThrow()
    await source.passwordResetToken.create({ data: { userId: user.id, tokenHash: 'a'.repeat(64), expiresAt: new Date(Date.now() + 3600_000) } })

    const { file } = await createBackup(source, PASS)
    await restoreBackup(target, file, PASS)
    expect(await target.revokedToken.count()).toBe(0)
    expect(await target.passwordResetToken.count()).toBe(0)
  })
})
