import { gunzipSync, gzipSync } from 'node:zlib'
import { PrismaClient } from '@prisma/client'
import { decryptBackup, encryptBackup } from './crypto'

/**
 * Backup lógico do banco, em Node puro: não depende de `pg_dump` (que precisa casar com a versão do servidor)
 * e funciona em qualquer lugar onde a aplicação roda. O arquivo é NDJSON comprimido e criptografado.
 *
 * Ficam de fora, de propósito: sessões revogadas e tokens de redefinição de senha (transitórios e sensíveis).
 * Tabelas em ordem de dependência: as que são referenciadas vêm antes.
 */
const TABLES = [
  ['category', 'Category'],
  ['product', 'Product'],
  ['extra', 'Extra'],
  ['user', 'User'],
  ['coupon', 'Coupon'],
  ['dailyCounter', 'DailyCounter'],
  ['order', 'Order'],
  ['orderItem', 'OrderItem'],
  ['payment', 'Payment'],
  ['orderEvent', 'OrderEvent'],
  ['auditLog', 'AuditLog'],
] as const

type Delegate = {
  findMany: (args?: object) => Promise<Record<string, unknown>[]>
  createMany: (args: { data: Record<string, unknown>[] }) => Promise<unknown>
  count: () => Promise<number>
}
const table = (prisma: PrismaClient, name: string) => (prisma as unknown as Record<string, Delegate>)[name]

export const BACKUP_FORMAT = 1
const CHUNK = 1000

export interface BackupHeader {
  format: number
  createdAt: string
  /** Migrações aplicadas no banco de origem: o restore só aceita bancos que tenham todas. */
  migrations: string[]
  counts: Record<string, number>
}

export class BackupError extends Error {}

/** Datas viram texto ISO no JSON; ao restaurar voltam a ser Date (reconhecidas pelo formato exato). */
const ISO_DATE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
const revive = (_key: string, value: unknown) => (typeof value === 'string' && ISO_DATE.test(value) ? new Date(value) : value)

export async function createBackup(prisma: PrismaClient, passphrase: string, now = new Date()): Promise<{ file: Buffer; header: BackupHeader }> {
  const migrations = (await prisma.$queryRaw<{ migration_name: string }[]>`SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL ORDER BY migration_name`).map(
    (m) => m.migration_name,
  )

  const lines: string[] = []
  const counts: Record<string, number> = {}
  for (const [delegate, tableName] of TABLES) {
    // Leitura em páginas: não carrega a tabela inteira de uma vez.
    let cursor = 0
    counts[tableName] = 0
    for (;;) {
      const rows = await table(prisma, delegate).findMany({ skip: cursor, take: 5000, orderBy: pk(delegate) })
      for (const r of rows) lines.push(JSON.stringify({ t: tableName, r }))
      counts[tableName] += rows.length
      cursor += rows.length
      if (rows.length < 5000) break
    }
  }

  const header: BackupHeader = { format: BACKUP_FORMAT, createdAt: now.toISOString(), migrations, counts }
  const ndjson = [JSON.stringify({ header }), ...lines].join('\n')
  return { file: encryptBackup(gzipSync(Buffer.from(ndjson, 'utf8')), passphrase), header }
}

/** Ordenação estável para paginar (cada tabela tem uma chave diferente). */
function pk(delegate: string): object {
  if (delegate === 'dailyCounter') return { date: 'asc' }
  return { id: 'asc' }
}

export interface RestoreResult {
  header: BackupHeader
  restored: Record<string, number>
}

/**
 * Restaura um backup em um banco que já tem o schema (migrações aplicadas). Tudo-ou-nada, numa transação.
 * Recusa banco com dados (a menos que `force`), backup de banco mais novo que este, senha errada e arquivo adulterado.
 */
export async function restoreBackup(prisma: PrismaClient, file: Buffer, passphrase: string, opts: { force?: boolean } = {}): Promise<RestoreResult> {
  const ndjson = gunzipSync(decryptBackup(file, passphrase)).toString('utf8')
  const [first, ...rest] = ndjson.split('\n').filter(Boolean)
  const header = (JSON.parse(first) as { header?: BackupHeader }).header
  if (!header || header.format !== BACKUP_FORMAT) throw new BackupError('Formato de backup não suportado')

  const have = new Set(
    (await prisma.$queryRaw<{ migration_name: string }[]>`SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL`).map((m) => m.migration_name),
  )
  const missing = header.migrations.filter((m) => !have.has(m))
  if (missing.length) {
    throw new BackupError(`O banco de destino está desatualizado (faltam migrações: ${missing.join(', ')}). Aplique as migrações antes de restaurar.`)
  }

  if (!opts.force) {
    for (const [delegate, name] of TABLES) {
      if ((await table(prisma, delegate).count()) > 0) {
        throw new BackupError(`O banco de destino não está vazio (${name} tem dados). Restaure num banco novo ou use --force.`)
      }
    }
  }

  const byTable = new Map<string, Record<string, unknown>[]>()
  for (const line of rest) {
    const { t, r } = JSON.parse(line, revive) as { t: string; r: Record<string, unknown> }
    if (!byTable.has(t)) byTable.set(t, [])
    byTable.get(t)!.push(r)
  }

  const restored: Record<string, number> = {}
  await prisma.$transaction(
    async (tx) => {
      const t = tx as unknown as PrismaClient
      if (opts.force) {
        // sobrescreve: apaga na ordem inversa das dependências
        for (const [delegate] of [...TABLES].reverse()) await (table(t, delegate) as unknown as { deleteMany: () => Promise<unknown> }).deleteMany()
      }
      for (const [delegate, name] of TABLES) {
        const rows = byTable.get(name) ?? []
        for (let i = 0; i < rows.length; i += CHUNK) await table(t, delegate).createMany({ data: rows.slice(i, i + CHUNK) })
        restored[name] = rows.length
      }
      // O número do pedido é sequencial no banco: sem isto o próximo pedido repetiria um número já existente.
      await tx.$executeRaw`SELECT setval(pg_get_serial_sequence('"Order"', 'number'), COALESCE((SELECT MAX("number") FROM "Order"), 0) + 1, false)`

      // Confere: o que entrou tem que bater com o que o backup dizia ter.
      for (const [delegate, name] of TABLES) {
        const actual = await table(t, delegate).count()
        if (actual !== (header.counts[name] ?? 0)) throw new BackupError(`Conferência falhou em ${name}: esperado ${header.counts[name]}, restaurado ${actual}`)
      }
    },
    { timeout: 10 * 60 * 1000, maxWait: 30_000 },
  )
  return { header, restored }
}
