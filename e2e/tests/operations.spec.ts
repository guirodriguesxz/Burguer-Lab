import { readFile } from 'node:fs/promises'
import { expect, test } from '@playwright/test'
import { PrismaClient } from '@prisma/client'
import * as bcrypt from 'bcryptjs'
import { E2E_DB } from '../playwright.config'
import { addSimpleProduct, goToCheckout, openStaff, resetState } from '../support/helpers'

const db = new PrismaClient({ datasources: { db: { url: E2E_DB } } })
const NEW_EMAIL = 'maria-e2e@burgerlab.dev'
const SELF_EMAIL = 'conta-e2e@burgerlab.dev'

test.beforeEach(async () => {
  await resetState()
  await db.user.deleteMany({ where: { email: { in: [NEW_EMAIL, SELF_EMAIL] } } })
})
test.afterAll(async () => {
  await db.user.deleteMany({ where: { email: { in: [NEW_EMAIL, SELF_EMAIL] } } })
  await db.$disconnect()
})

async function login(page: import('@playwright/test').Page, email: string, password: string) {
  await page.goto('/admin/')
  await page.getByLabel('E-mail').fill(email)
  await page.getByLabel('Senha', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Entrar' }).click()
}

test('usuários: admin cria, a pessoa entra com acesso só da função, e desativar corta o acesso', async ({ browser }) => {
  const admin = await openStaff(browser, 'admin')
  await admin.page.getByRole('button', { name: /Usuários/ }).click()

  await admin.page.getByLabel('Nome').fill('Maria Souza')
  await admin.page.getByLabel('E-mail').fill(NEW_EMAIL)
  await admin.page.getByLabel('Papel').first().selectOption('CASHIER')
  await admin.page.getByLabel('Senha inicial').fill('senha-inicial-2026')
  await admin.page.getByRole('button', { name: 'Criar usuário' }).click()
  await expect(admin.page.getByRole('status')).toContainText('Maria Souza')
  const row = admin.page.getByRole('row', { name: /Maria Souza/ })
  await expect(row).toBeVisible()

  // A pessoa entra e só enxerga o caixa.
  const ctx = await browser.newContext({ baseURL: 'http://localhost:3100' })
  const maria = await ctx.newPage()
  await login(maria, NEW_EMAIL, 'senha-inicial-2026')
  await expect(maria.getByRole('button', { name: /Caixa/ })).toBeVisible()
  await expect(maria.getByRole('button', { name: /Cozinha/ })).toHaveCount(0)
  await expect(maria.getByText('● Ao vivo')).toBeVisible()

  // Admin desativa: a conexão em tempo real cai e o próximo acesso é recusado.
  await row.getByRole('checkbox', { name: /Desativar Maria/ }).click()
  await expect(row.getByText('Desativado')).toBeVisible()
  await expect(maria.getByRole('button', { name: 'Entrar' })).toBeVisible() // a tela dela volta ao login sozinha
  await maria.reload()
  await expect(maria.getByRole('button', { name: 'Entrar' })).toBeVisible()
  await login(maria, NEW_EMAIL, 'senha-inicial-2026')
  await expect(maria.getByRole('alert')).toHaveText('E-mail ou senha incorretos')

  // Reativa: volta a entrar.
  await row.getByRole('checkbox', { name: /Ativar Maria/ }).click()
  await expect(row.getByText('Ativo')).toBeVisible()
  await login(maria, NEW_EMAIL, 'senha-inicial-2026')
  await expect(maria.getByRole('button', { name: /Caixa/ })).toBeVisible()

  await ctx.close()
  await admin.context.close()
})

test('usuários: o admin não altera o próprio acesso pela tela', async ({ browser }) => {
  const admin = await openStaff(browser, 'admin')
  await admin.page.getByRole('button', { name: /Usuários/ }).click()
  const me = admin.page.getByRole('row', { name: /Admin/ }).first()
  await expect(me.getByText('você')).toBeVisible()
  await expect(me.getByRole('combobox')).toBeDisabled()
  await expect(me.getByRole('checkbox')).toBeDisabled()
  await admin.context.close()
})

test('minha senha: troca a senha logado, valida os campos e a nova senha passa a valer', async ({ page }) => {
  await db.user.create({ data: { email: SELF_EMAIL, name: 'Conta E2E', role: 'KITCHEN', passwordHash: await bcrypt.hash('senha-antiga-2026', 4) } })
  await login(page, SELF_EMAIL, 'senha-antiga-2026')
  await expect(page.getByText('● Ao vivo')).toBeVisible()

  await page.getByRole('button', { name: 'Minha senha' }).click()
  const dialog = page.getByRole('dialog', { name: 'Alterar minha senha' })
  await dialog.getByLabel('Senha atual').fill('errada-2026xx')
  await dialog.getByLabel('Nova senha', { exact: true }).fill('senha-nova-2026x')
  await dialog.getByLabel('Repita a nova senha').fill('senha-nova-2026x')
  await dialog.getByRole('button', { name: 'Salvar' }).click()
  await expect(dialog.getByRole('alert')).toHaveText('Senha atual incorreta')

  await dialog.getByLabel('Senha atual').fill('senha-antiga-2026')
  await dialog.getByLabel('Repita a nova senha').fill('diferente-2026xx')
  await dialog.getByRole('button', { name: 'Salvar' }).click()
  await expect(dialog.getByRole('alert')).toHaveText('As senhas não são iguais')

  await dialog.getByLabel('Nova senha', { exact: true }).fill('fraca')
  await dialog.getByLabel('Repita a nova senha').fill('fraca')
  await dialog.getByRole('button', { name: 'Salvar' }).click()
  await expect(dialog.getByRole('alert')).toContainText('ao menos 10 caracteres')

  await dialog.getByLabel('Nova senha', { exact: true }).fill('senha-nova-2026x')
  await dialog.getByLabel('Repita a nova senha').fill('senha-nova-2026x')
  await dialog.getByRole('button', { name: 'Salvar' }).click()
  await expect(dialog.getByRole('status')).toContainText('Senha alterada')
  await dialog.getByRole('button', { name: 'Fechar' }).click()

  // Continua logado (token novo) e a tela volta a ficar "ao vivo".
  await expect(page.getByText('● Ao vivo')).toBeVisible()

  await page.getByRole('button', { name: 'Sair' }).click()
  await page.getByLabel('E-mail').fill(SELF_EMAIL)
  await page.getByLabel('Senha', { exact: true }).fill('senha-antiga-2026')
  await page.getByRole('button', { name: 'Entrar' }).click()
  await expect(page.getByRole('alert')).toHaveText('E-mail ou senha incorretos')
  await page.getByLabel('Senha', { exact: true }).fill('senha-nova-2026x')
  await page.getByRole('button', { name: 'Entrar' }).click()
  await expect(page.getByRole('button', { name: 'Sair' })).toBeVisible()
})

test('histórico de pedidos: busca, estorno pela tela e exportação CSV', async ({ page, browser }) => {
  await page.goto('/')
  await addSimpleProduct(page, 'Acompanhamentos', 'Batata Frita')
  await goToCheckout(page)
  await page.getByRole('button', { name: /Cartão/ }).click()
  await page.getByRole('button', { name: 'Simular pagamento no cartão' }).click()
  await expect(page.getByRole('heading', { name: 'Pedido confirmado!' })).toBeVisible({ timeout: 15_000 })

  const admin = await openStaff(browser, 'admin')
  await admin.page.getByRole('button', { name: /Pedidos/ }).click()
  const row = admin.page.getByRole('row', { name: /#1/ })
  await expect(row).toBeVisible()
  await expect(row).toContainText('Pago')
  await expect(row).toContainText('Cartão')
  await expect(row).toContainText('R$ 14,90')

  // Detalhes e busca
  await row.getByRole('button', { name: 'Detalhes' }).click()
  await expect(admin.page.getByText('1× Batata Frita')).toBeVisible()
  await admin.page.getByLabel('Buscar').fill('xyz-nao-existe')
  await admin.page.getByRole('button', { name: 'Filtrar' }).click()
  await expect(admin.page.getByText('Nenhum pedido encontrado.')).toBeVisible()
  await admin.page.getByLabel('Buscar').fill('batata')
  await admin.page.getByRole('button', { name: 'Filtrar' }).click()
  await expect(admin.page.getByRole('row', { name: /#1/ })).toBeVisible()
  await admin.page.getByLabel('Pagamento').selectOption('CASH')
  await admin.page.getByRole('button', { name: 'Filtrar' }).click()
  await expect(admin.page.getByText('Nenhum pedido encontrado.')).toBeVisible()
  await admin.page.getByLabel('Pagamento').selectOption('')
  await admin.page.getByRole('button', { name: 'Filtrar' }).click()

  // CSV
  const [download] = await Promise.all([admin.page.waitForEvent('download'), admin.page.getByRole('button', { name: /Exportar CSV/ }).click()])
  expect(download.suggestedFilename()).toBe('pedidos.csv')
  const csv = await readFile((await download.path())!, 'utf8')
  expect(csv.charCodeAt(0)).toBe(0xfeff)
  expect(csv).toContain('Senha;Pedido;Data/hora;Status')
  expect(csv).toContain('1x Batata Frita')
  expect(csv).toContain('14,90')

  // Estorno pela tela
  admin.page.once('dialog', (d) => d.accept())
  await admin.page.getByRole('row', { name: /#1/ }).getByRole('button', { name: 'Estornar' }).click()
  const refunded = admin.page.getByRole('row', { name: /#1/ })
  await expect(refunded).toContainText('Cancelado')
  await expect(refunded).toContainText('Estornado')
  await expect(refunded.getByRole('button', { name: 'Estornar' })).toHaveCount(0)

  await admin.context.close()
})
