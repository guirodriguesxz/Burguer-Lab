import { createHmac } from 'node:crypto'
import { APIRequestContext, Browser, BrowserContext, expect, Page } from '@playwright/test'
import { PrismaClient } from '@prisma/client'
import { E2E_DB } from '../playwright.config'

export const CREDS = {
  admin: { email: 'admin@burgerlab.dev', password: 'admin123' },
  kitchen: { email: 'cozinha@burgerlab.dev', password: 'cozinha123' },
  cashier: { email: 'caixa@burgerlab.dev', password: 'caixa123' },
}

/** Zera pedidos e restaura cupons/produtos entre testes (o cardápio do seed é mantido). */
export async function resetState() {
  const prisma = new PrismaClient({ datasources: { db: { url: E2E_DB } } })
  try {
    await prisma.$executeRawUnsafe('TRUNCATE "OrderEvent","Payment","OrderItem","Order","DailyCounter","AuditLog","RevokedToken" RESTART IDENTITY CASCADE')
    await prisma.$executeRawUnsafe('UPDATE "Coupon" SET "usedCount" = 0, active = true')
    await prisma.$executeRawUnsafe('UPDATE "Product" SET available = true, stock = CASE WHEN stock IS NULL THEN NULL ELSE 50 END')
  } finally {
    await prisma.$disconnect()
  }
}

/** Entra pela API: a sessão fica no cookie do contexto de requisições, que o reenvia nas chamadas seguintes. */
export async function apiLogin(request: APIRequestContext, who: keyof typeof CREDS = 'admin') {
  const res = await request.post('/api/auth/login', { data: CREDS[who] })
  expect(res.status()).toBe(201)
}

/** Faz o papel do provedor Pix: webhook com assinatura HMAC sobre o corpo bruto. */
export async function sendPixWebhook(request: APIRequestContext, txid: string, amountCents: number, signature?: string) {
  const raw = JSON.stringify({ txid, status: 'PAID', amountCents })
  const sig = signature ?? createHmac('sha256', 'e2e-webhook-secret').update(raw).digest('hex')
  return request.post('/api/webhooks/pix', { headers: { 'Content-Type': 'application/json', 'x-signature': sig }, data: raw })
}

export async function findOrder(request: APIRequestContext, match: (o: any) => boolean) {
  await apiLogin(request)
  const res = await request.get('/api/orders')
  return ((await res.json()) as any[]).find(match)
}

/** Abre o app da equipe já logado, em um contexto próprio (como uma segunda tela na cozinha). */
export async function openStaff(browser: Browser, who: keyof typeof CREDS = 'kitchen'): Promise<{ page: Page; context: BrowserContext }> {
  const context = await browser.newContext({ baseURL: `http://localhost:3100`, locale: 'pt-BR' })
  const page = await context.newPage()
  await page.goto('/admin/')
  await page.getByLabel('E-mail').fill(CREDS[who].email)
  await page.getByLabel('Senha', { exact: true }).fill(CREDS[who].password)
  await page.getByRole('button', { name: 'Entrar' }).click()
  await expect(page.getByText('● Ao vivo')).toBeVisible()
  return { page, context }
}

/** Totem: do início até o carrinho com um produto simples (sem personalização). */
export async function addSimpleProduct(page: Page, category: string, name: string) {
  await page.getByRole('button', { name: 'Comer aqui' }).click()
  await page.getByRole('button', { name: category }).click()
  await page.locator('button.product', { hasText: name }).click()
}

/** Totem: vai ao pagamento, dispensando a sugestão de upsell se ela aparecer. */
export async function goToCheckout(page: Page) {
  await page.getByRole('button', { name: 'Ir para pagamento' }).click()
  const upsell = page.getByRole('dialog', { name: 'Sugestões para seu pedido' })
  await upsell.getByRole('button', { name: 'Não, obrigado' }).click({ timeout: 3_000 }).catch(() => undefined)
  await expect(page.getByRole('heading', { name: 'Pagamento' })).toBeVisible()
}

export async function ticketNumber(page: Page) {
  await expect(page.getByRole('heading', { name: 'Pedido confirmado!' })).toBeVisible({ timeout: 15_000 })
  return (await page.locator('.ticket strong').innerText()).trim()
}

export const column = (page: Page, title: string) => page.locator('section.kcol', { has: page.getByRole('heading', { name: title }) })
