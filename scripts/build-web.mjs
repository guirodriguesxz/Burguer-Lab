// Compila totem e admin e copia o resultado para apps/api/public, de onde a API os serve em produção:
//   /        -> totem (PWA)
//   /admin/  -> app da equipe
import { execSync } from 'node:child_process'
import { cpSync, mkdirSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const run = (cmd) => execSync(cmd, { cwd: root, stdio: 'inherit' })

run('npm run build -w @burger-lab/kiosk')
run('npm run build -w @burger-lab/admin')

const publicDir = join(root, 'apps', 'api', 'public')
rmSync(publicDir, { recursive: true, force: true })
mkdirSync(publicDir, { recursive: true })
cpSync(join(root, 'apps', 'kiosk', 'dist'), publicDir, { recursive: true })
cpSync(join(root, 'apps', 'admin', 'dist'), join(publicDir, 'admin'), { recursive: true })
console.log('Front-ends copiados para apps/api/public')
