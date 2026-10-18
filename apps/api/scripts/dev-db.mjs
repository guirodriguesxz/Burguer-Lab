// Postgres local sem Docker, para desenvolvimento. Mesmas credenciais do docker-compose.yml.
import EmbeddedPostgres from 'embedded-postgres'
import { existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const dataDir = join(dirname(fileURLToPath(import.meta.url)), '..', '.pgdata')

const pg = new EmbeddedPostgres({ databaseDir: dataDir, user: 'burger', password: 'burger', port: 5432, persistent: true, initdbFlags: ['--encoding=UTF8', '--locale=C'] })

if (!existsSync(join(dataDir, 'PG_VERSION'))) await pg.initialise()
await pg.start()
try {
  await pg.createDatabase('burgerlab')
} catch {
  // banco jÃ¡ existe
}
console.log('Postgres local rodando em localhost:5432 (Ctrl+C para parar)')

const stop = async () => {
  await pg.stop()
  process.exit(0)
}
process.on('SIGINT', stop)
process.on('SIGTERM', stop)

