import { createHash } from 'node:crypto'
import { expect, test } from '@playwright/test'
import { PrismaClient } from '@prisma/client'
import * as bcrypt from 'bcryptjs'
import { E2E_DB } from '../playwright.config'

// Usuário exclusivo deste arquivo: trocar a senha de uma conta compartilhada quebraria os outros testes.
const EMAIL = 'reset-e2e@burgerlab.dev'
const OLD_PASSWORD = 'senha-antiga-2026'
const NEW_PASSWORD = 'senha-nova-2026x'

const db = new PrismaClient({ datasources: { db: { url: E2E_DB } } })
const sha256 = (v: string) => createHash('sha256').update(v).digest('hex')

test.beforeAll(async () => {
  await db.user.deleteMany({ where: { email: EMAIL } })
  await db.user.create({ data: { email: EMAIL, name: 'Reset E2E', role: 'KITCHEN', passwordHash: await bcrypt.hash(OLD_PASSWORD, 4) } })
})
test.afterAll(async () => {
  await db.user.deleteMany({ where: { email: EMAIL } })
  await db.$disconnect()
})

test('mostrar/ocultar senha no login', async ({ page }) => {
  await page.goto('/admin/')
  const field = page.getByLabel('Senha', { exact: true })
  await field.fill('segredo-123')
  await expect(field).toHaveAttribute('type', 'password')

  await page.getByRole('button', { name: 'Mostrar senha' }).click()
  await expect(field).toHaveAttribute('type', 'text')
  await expect(page.getByRole('button', { name: 'Ocultar senha' })).toHaveAttribute('aria-pressed', 'true')

  await page.getByRole('button', { name: 'Ocultar senha' }).click()
  await expect(field).toHaveAttribute('type', 'password')
})

test('esqueci minha senha: pede o link, abre o link, valida a nova senha e entra com ela', async ({ page, request }) => {
  // 1) Pede o link. A resposta é a mesma para qualquer e-mail (não revela contas).
  await page.goto('/admin/')
  await page.getByRole('button', { name: 'Esqueci minha senha' }).click()
  await page.getByLabel('E-mail').fill('ninguem@exemplo.com')
  await page.getByRole('button', { name: 'Enviar link' }).click()
  await expect(page.getByText(/Se o e-mail estiver cadastrado/)).toBeVisible()

  await page.getByRole('button', { name: 'Voltar ao login' }).click()
  await page.getByRole('button', { name: 'Esqueci minha senha' }).click()
  await page.getByLabel('E-mail').fill(EMAIL)
  await page.getByRole('button', { name: 'Enviar link' }).click()
  await expect(page.getByText(/Se o e-mail estiver cadastrado/)).toBeVisible()

  // 2) Em produção o token chega por e-mail; aqui o teste o define (só o hash fica no banco).
  const token = 'ab'.repeat(32)
  await expect.poll(() => db.passwordResetToken.count({ where: { user: { email: EMAIL } } })).toBe(1)
  await db.passwordResetToken.updateMany({ where: { user: { email: EMAIL } }, data: { tokenHash: sha256(token) } })

  // 3) Abre o link.
  await page.goto(`/admin/?reset=${token}`)
  await expect(page.getByRole('heading', { name: 'Nova senha' })).toBeVisible()
  await page.getByLabel('Nova senha', { exact: true }).fill(NEW_PASSWORD)
  await page.getByLabel('Repita a nova senha').fill('diferente-2026x')
  await page.getByRole('button', { name: 'Salvar nova senha' }).click()
  await expect(page.getByRole('alert')).toHaveText('As senhas não são iguais')

  await page.getByLabel('Nova senha', { exact: true }).fill('fraca')
  await page.getByLabel('Repita a nova senha').fill('fraca')
  await page.getByRole('button', { name: 'Salvar nova senha' }).click()
  await expect(page.getByRole('alert')).toContainText('ao menos 10 caracteres') // recusada pelo servidor

  await page.getByLabel('Nova senha', { exact: true }).fill(NEW_PASSWORD)
  await page.getByLabel('Repita a nova senha').fill(NEW_PASSWORD)
  await page.getByRole('button', { name: 'Salvar nova senha' }).click()

  // 4) Volta ao login, sem o token na URL, e a senha antiga deixou de valer.
  await expect(page.getByText('Senha alterada! Entre com a nova senha.')).toBeVisible()
  expect(page.url()).not.toContain('reset=')

  await page.getByLabel('E-mail').fill(EMAIL)
  await page.getByLabel('Senha', { exact: true }).fill(OLD_PASSWORD)
  await page.getByRole('button', { name: 'Entrar' }).click()
  await expect(page.getByRole('alert')).toHaveText('E-mail ou senha incorretos')

  await page.getByLabel('Senha', { exact: true }).fill(NEW_PASSWORD)
  await page.getByRole('button', { name: 'Entrar' }).click()
  await expect(page.getByRole('button', { name: 'Sair' })).toBeVisible()

  // 5) O link não funciona de novo.
  const again = await request.post('/api/auth/reset-password', { data: { token, password: 'outra-senha-2026x' } })
  expect(again.status()).toBe(400)
})

test('link de redefinição inválido mostra erro claro', async ({ page }) => {
  await page.goto(`/admin/?reset=${'cd'.repeat(32)}`)
  await page.getByLabel('Nova senha', { exact: true }).fill(NEW_PASSWORD)
  await page.getByLabel('Repita a nova senha').fill(NEW_PASSWORD)
  await page.getByRole('button', { name: 'Salvar nova senha' }).click()
  await expect(page.getByRole('alert')).toContainText('Link inválido ou expirado')
})
