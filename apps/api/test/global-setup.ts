import { execSync } from 'node:child_process'
import { PrismaClient } from '@prisma/client'

const url =
  process.env.TEST_DATABASE_URL ?? 'postgresql://burger:burger@localhost:5432/burgerlab_test?schema=public'

/** Cria o banco de teste (se não existir) e aplica as migrações reais. */
export default async function globalSetup() {
  const dbName = new URL(url).pathname.slice(1)
  const adminUrl = url.replace(`/${dbName}`, '/postgres')

  const admin = new PrismaClient({ datasources: { db: { url: adminUrl } } })
  try {
    await admin.$executeRawUnsafe(`CREATE DATABASE "${dbName}"`)
  } catch {
    // já existe
  } finally {
    await admin.$disconnect()
  }

  execSync('npx prisma migrate deploy', {
    cwd: __dirname + '/..',
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'pipe',
  })
}
