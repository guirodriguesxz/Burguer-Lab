import { expect, test } from '@playwright/test'
import { addSimpleProduct, column, goToCheckout, openStaff, resetState } from '../support/helpers'

test.beforeEach(resetState)

test('pagamento no caixa: totem gera a senha, o caixa confirma e só então a cozinha recebe', async ({ page, browser }) => {
  const kitchen = await openStaff(browser, 'kitchen')
  const cashier = await openStaff(browser, 'cashier')
  await expect(cashier.page.getByText('Nenhum pedido aguardando pagamento.')).toBeVisible()

  // Totem
  await page.goto('/')
  await addSimpleProduct(page, 'Acompanhamentos', 'Batata Frita')
  await goToCheckout(page)
  await page.getByRole('button', { name: /No caixa/ }).click()
  await page.getByRole('button', { name: 'Gerar senha e pagar no caixa' }).click()

  await expect(page.getByRole('heading', { name: 'Pedido registrado!' })).toBeVisible({ timeout: 15_000 })
  await expect(page.getByText(/Dirija-se ao caixa/)).toBeVisible()
  const number = (await page.locator('.ticket strong').innerText()).trim()

  // O caixa vê o pedido na hora; a cozinha ainda não.
  const pending = cashier.page.locator('.cash-card', { hasText: `#${number}` })
  await expect(pending).toBeVisible()
  await expect(pending).toContainText('Batata Frita')
  await expect(pending).toContainText('R$ 14,90')
  await expect(kitchen.page.locator('.kcard')).toHaveCount(0)

  // Recebeu o dinheiro: confirma e o pedido segue para a cozinha.
  await pending.getByRole('button', { name: /Recebi/ }).click()
  await expect(pending).toBeHidden()
  await expect(column(kitchen.page, 'Novos').locator('.kcard', { hasText: `#${number}` })).toBeVisible()

  await kitchen.context.close()
  await cashier.context.close()
})

test('caixa pode cancelar um pedido que o cliente desistiu de pagar', async ({ page, browser }) => {
  const cashier = await openStaff(browser, 'cashier')

  await page.goto('/')
  await addSimpleProduct(page, 'Acompanhamentos', 'Batata Frita')
  await goToCheckout(page)
  await page.getByRole('button', { name: /No caixa/ }).click()
  await page.getByRole('button', { name: 'Gerar senha e pagar no caixa' }).click()
  await expect(page.getByRole('heading', { name: 'Pedido registrado!' })).toBeVisible({ timeout: 15_000 })

  const pending = cashier.page.locator('.cash-card')
  await expect(pending).toHaveCount(1)
  await pending.getByRole('button', { name: 'Cancelar' }).click()
  await expect(pending).toHaveCount(0)
  await cashier.context.close()
})
