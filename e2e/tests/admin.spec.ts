import { expect, test } from '@playwright/test'
import { CREDS, openStaff, resetState } from '../support/helpers'

test.beforeEach(resetState)

test('login: senha errada é recusada com mensagem genérica', async ({ page }) => {
  await page.goto('/admin/')
  await page.getByLabel('E-mail').fill(CREDS.admin.email)
  await page.getByLabel('Senha').fill('senha-errada')
  await page.getByRole('button', { name: 'Entrar' }).click()
  await expect(page.getByRole('alert')).toHaveText('E-mail ou senha incorretos')
  await expect(page.getByRole('button', { name: 'Sair' })).toBeHidden()
})

test('RBAC: a cozinha só vê a cozinha; o admin vê tudo', async ({ browser }) => {
  const kitchen = await openStaff(browser, 'kitchen')
  await expect(kitchen.page.getByRole('button', { name: /Cozinha/ })).toBeVisible()
  await expect(kitchen.page.getByRole('button', { name: /Cardápio/ })).toHaveCount(0)
  await expect(kitchen.page.getByRole('button', { name: /Cupons/ })).toHaveCount(0)
  await expect(kitchen.page.getByRole('button', { name: /Relatórios/ })).toHaveCount(0)
  await kitchen.context.close()

  const admin = await openStaff(browser, 'admin')
  for (const tab of [/Cardápio/, /Cupons/, /Relatórios/]) await expect(admin.page.getByRole('button', { name: tab })).toBeVisible()
  await admin.context.close()
})

test('sessão persiste ao recarregar e "Sair" volta ao login', async ({ browser }) => {
  const admin = await openStaff(browser, 'admin')
  await admin.page.reload()
  await expect(admin.page.getByRole('button', { name: 'Sair' })).toBeVisible()
  await admin.page.getByRole('button', { name: 'Sair' }).click()
  await expect(admin.page.getByRole('button', { name: 'Entrar' })).toBeVisible()
  await admin.context.close()
})

test('pausar um produto no admin reflete no totem em tempo real', async ({ page, browser }) => {
  // Totem aberto na categoria de sobremesas, com o Brownie disponível.
  await page.goto('/')
  await page.getByRole('button', { name: 'Comer aqui' }).click()
  await page.getByRole('button', { name: 'Sobremesas' }).click()
  const brownie = page.locator('button.product', { hasText: 'Brownie' })
  await expect(brownie).toBeEnabled()

  const admin = await openStaff(browser, 'admin')
  await admin.page.getByRole('button', { name: /Cardápio/ }).click()
  const toggle = admin.page.getByRole('row', { name: /Brownie/ }).getByRole('checkbox')
  await toggle.click() // controlado: muda só depois da resposta do servidor
  await expect(toggle).not.toBeChecked()

  await expect(brownie).toBeDisabled() // sem recarregar
  await expect(brownie).toContainText('Esgotado')

  await toggle.click()
  await expect(toggle).toBeChecked()
  await expect(brownie).toBeEnabled()
  await admin.context.close()
})

test('relatório mostra o faturamento de um pedido feito', async ({ page, browser }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Comer aqui' }).click()
  await page.getByRole('button', { name: 'Acompanhamentos' }).click()
  await page.locator('button.product', { hasText: 'Batata Frita' }).click()
  await page.getByRole('button', { name: 'Ir para pagamento' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Não, obrigado' }).click()
  await page.getByRole('button', { name: /Cartão/ }).click()
  await page.getByRole('button', { name: 'Simular pagamento no cartão' }).click()
  await expect(page.getByRole('heading', { name: 'Pedido confirmado!' })).toBeVisible({ timeout: 15_000 })

  const admin = await openStaff(browser, 'admin')
  await admin.page.getByRole('button', { name: /Relatórios/ }).click()
  await expect(admin.page.locator('.stat', { hasText: 'Faturamento' })).toContainText('R$ 14,90')
  await expect(admin.page.locator('.stat', { hasText: 'Pedidos' })).toContainText('1')
  await expect(admin.page.locator('.top')).toContainText('Batata Frita')
  await admin.context.close()
})
