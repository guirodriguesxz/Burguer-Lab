/**
 * Uso (a partir de apps/api, depois do build):
 *   BACKUP_PASSPHRASE=... node dist/backup/cli.js backup [pasta]       cria <pasta>/burgerlab-AAAAMMDD-HHMMSS.blbk
 *   BACKUP_PASSPHRASE=... node dist/backup/cli.js restore <arquivo> [--force]
 *   BACKUP_PASSPHRASE=... node dist/backup/cli.js verify <arquivo>     decifra e confere o arquivo, sem tocar no banco
 * O banco é o de DATABASE_URL.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { gunzipSync } from 'node:zlib'
import { PrismaClient } from '@prisma/client'
import { BackupError, BackupHeader, createBackup, restoreBackup } from './backup'
import { BackupCryptoError, decryptBackup } from './crypto'

const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15)

async function main() {
  const [command, arg, ...flags] = process.argv.slice(2)
  const passphrase = process.env.BACKUP_PASSPHRASE
  if (!passphrase) throw new BackupError('Defina BACKUP_PASSPHRASE (mínimo 16 caracteres). Guarde-a em local seguro: sem ela o backup não abre.')

  if (command === 'verify') {
    if (!arg) throw new BackupError('Informe o arquivo')
    const first = gunzipSync(decryptBackup(readFileSync(arg), passphrase)).toString('utf8').split('\n', 1)[0]
    const header = (JSON.parse(first) as { header: BackupHeader }).header
    console.log(`Backup íntegro (criado em ${header.createdAt}). Linhas por tabela:`, header.counts)
    return
  }

  const prisma = new PrismaClient()
  try {
    if (command === 'backup') {
      const dir = arg ?? 'backups'
      mkdirSync(dir, { recursive: true })
      const { file, header } = await createBackup(prisma, passphrase)
      const path = join(dir, `burgerlab-${stamp(new Date(header.createdAt))}.blbk`)
      writeFileSync(path, file, { mode: 0o600 }) // só o dono lê
      console.log(`Backup criado: ${path} (${(file.length / 1024).toFixed(1)} KB). Linhas por tabela:`, header.counts)
    } else if (command === 'restore') {
      if (!arg) throw new BackupError('Informe o arquivo')
      const { restored } = await restoreBackup(prisma, readFileSync(arg), passphrase, { force: flags.includes('--force') })
      console.log('Restauração concluída e conferida. Linhas por tabela:', restored)
    } else {
      throw new BackupError('Comando inválido. Use: backup | restore | verify')
    }
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((e) => {
  // Mensagens conhecidas são claras; nunca imprime a senha nem o conteúdo do arquivo.
  console.error(e instanceof BackupError || e instanceof BackupCryptoError ? `Erro: ${e.message}` : e)
  process.exit(1)
})
