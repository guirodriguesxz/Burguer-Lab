// Prepara o banco de E2E do zero (drop, migrações, seed) e só então inicia a API compilada.
// Precisa ser feito aqui porque o Playwright sobe o webServer antes do globalSetup.
import { execSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createRequire } from 'node:module'

const apiDir = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'apps', 'api')
const { PrismaClient } = createRequire(join(apiDir, 'package.json'))('@prisma/client')

const url = process.env.DATABASE_URL
const dbName = new URL(url).pathname.slice(1)

const admin = new PrismaClient({ datasources: { db: { url: url.replace(`/${dbName}`, '/postgres') } } })
try {
  await admin.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${dbName}" WITH (FORCE)`)
  await admin.$executeRawUnsafe(`CREATE DATABASE "${dbName}"`)
} finally {
  await admin.$disconnect()
}

const opts = { cwd: apiDir, env: process.env, stdio: 'pipe' }
execSync('npx prisma migrate deploy', opts)
execSync('npx prisma db seed', opts)

await import(pathToFileURL(join(apiDir, 'dist', 'main.js')).href)
