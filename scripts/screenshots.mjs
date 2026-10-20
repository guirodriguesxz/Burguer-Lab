// Gera os prints do README (docs/img) a partir de um app rodando em modo demonstração.
// Uso: BASE_URL=http://localhost:3200 ADMIN_EMAIL=... ADMIN_PASSWORD=... node scripts/screenshots.mjs
// Precisa do Playwright (já instalado no workspace e2e) e de um navegador (E2E_CHANNEL=msedge|chrome).
import { mkdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const { chromium } = createRequire(join(root, 'e2e', 'package.json'))('@playwright/test')

const BASE = process.env.BASE_URL ?? 'http://localhost:3200'
const out = join(root, 'docs', 'img')
mkdirSync(out, { recursive: true })

const browser = await chromium.launch({ channel: process.env.E2E_CHANNEL ?? 'msedge' })
const shot = (page, name) => page.screenshot({ path: join(out, `${name}.png`) })

// --- Totem do cliente (tela de toque horizontal) ---
const kiosk = await browser.newPage({ viewport: { width: 1280, height: 800 } })
await kiosk.goto(BASE)
await shot(kiosk, '01-totem-boas-vindas')
await kiosk.getByRole('button', { name: 'Comer aqui' }).click()
await kiosk.locator('button.product').first().waitFor()
await kiosk.locator('button.product', { hasText: 'Clássico' }).click()
await kiosk.getByRole('dialog').getByRole('button', { name: /Bacon/ }).click()
await shot(kiosk, '02-totem-personalizar')
await kiosk.getByRole('button', { name: /^Adicionar/ }).click()
await kiosk.getByRole('button', { name: 'Combos' }).click()
await kiosk.locator('button.product', { hasText: 'Combo Bacon' }).click()
await shot(kiosk, '03-totem-cardapio')
await kiosk.getByRole('button', { name: 'Ir para pagamento' }).click()
await kiosk.getByRole('dialog', { name: 'Sugestões para seu pedido' }).waitFor()
await shot(kiosk, '04-totem-sugestoes')
await kiosk.getByRole('button', { name: 'Não, obrigado' }).click()
await kiosk.getByRole('button', { name: /Pix/ }).click()
await kiosk.getByRole('button', { name: 'Gerar QR Code Pix' }).click()
await kiosk.locator('img.qr-img').waitFor()
await shot(kiosk, '05-totem-pix')
await kiosk.getByRole('button', { name: /Demonstração/ }).click()
await kiosk.locator('.ticket').waitFor()
await shot(kiosk, '06-totem-senha')
await kiosk.close()

// Inglês e alto contraste
const alt = await browser.newPage({ viewport: { width: 1280, height: 800 } })
await alt.goto(BASE)
await alt.getByRole('button', { name: 'English' }).click()
await alt.getByRole('button', { name: /High contrast/ }).click()
await alt.getByRole('button', { name: 'Eat here' }).click()
await alt.locator('button.product').first().waitFor()
await shot(alt, '07-totem-ingles-alto-contraste')
await alt.close()

// Tela de senhas (TV)
const tv = await browser.newPage({ viewport: { width: 1280, height: 720 } })
await tv.goto(`${BASE}/#/senhas`)
await tv.waitForTimeout(1500)
await shot(tv, '08-tela-de-senhas')
await tv.close()

// --- Painel da equipe ---
const staff = await browser.newPage({ viewport: { width: 1360, height: 860 } })
await staff.goto(`${BASE}/admin/`)
await shot(staff, '09-painel-login')
await staff.getByLabel('E-mail').fill(process.env.ADMIN_EMAIL ?? 'admin@burgerlab.dev')
await staff.getByLabel('Senha', { exact: true }).fill(process.env.ADMIN_PASSWORD ?? 'admin123')
await staff.getByRole('button', { name: 'Entrar' }).click()
await staff.getByRole('button', { name: /Cozinha/ }).waitFor()
for (const [label, name] of [
  ['Cozinha', '10-painel-cozinha'],
  ['Relatórios', '11-painel-relatorios'],
  ['Pedidos', '12-painel-historico'],
  ['Cardápio', '13-painel-cardapio'],
  ['Auditoria', '14-painel-auditoria'],
]) {
  await staff.getByRole('button', { name: new RegExp(label) }).click()
  await staff.waitForTimeout(1200)
  await shot(staff, name)
}
await browser.close()
console.log('Prints em', out)
