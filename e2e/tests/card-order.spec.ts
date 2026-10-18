import { expect, test } from '@playwright/test'
import { column, goToCheckout, openStaff, resetState, ticketNumber } from '../support/helpers'

test.beforeEach(resetState)

test('pedido no cartão com adicional e cupom aparece ao vivo na cozinha e percorre o fluxo', async ({ page, browser }) => {
  const kitchen = await openStaff(browser, 'kitchen')

  // Totem: Clássico + bacon (R$ 24,90 + R$ 4,00)
  await page.goto('/')
  await page.getByRole('button', { name: 'Comer aqui' }).click()
  await page.locator('button.product', { hasText: 'Clássico' }).click()
  await page.getByRole('button', { name: /Bacon crocante/ }).click()
  await page.getByRole('button', { name: /Adicionar · R\$\s*28,90/ }).click()
  await expect(page.locator('.cart-footer')).toContainText('R$ 28,90')

  await goToCheckout(page)
  await page.getByLabel('Cupom de desconto').fill('bemvindo10')
  await page.getByRole('button', { name: 'Aplicar' }).click()
  await expect(page.getByText(/Cupom BEMVINDO10 aplicado/)).toBeVisible()
  await expect(page.locator('.totals')).toContainText('R$ 26,01') // 28,90 − 10% (2,89)

  await page.getByRole('button', { name: /Cartão/ }).click()
  await page.getByRole('button', { name: 'Simular pagamento no cartão' }).click()
  const number = await ticketNumber(page)

  // Cozinha (outra tela, sem recarregar): o pedido chega sozinho com os detalhes.
  const card = column(kitchen.page, 'Novos').locator('.kcard', { hasText: `#${number}` })
  await expect(card).toBeVisible()
  await expect(card).toContainText('Clássico')
  await expect(card).toContainText('+ Bacon crocante')
  await expect(card).toContainText('R$ 26,01')

  await card.getByRole('button', { name: 'Preparar' }).click()
  const preparing = column(kitchen.page, 'Preparando').locator('.kcard', { hasText: `#${number}` })
  await expect(preparing).toBeVisible()
  await preparing.getByRole('button', { name: /Pronto/ }).click()
  await expect(column(kitchen.page, 'Prontos').locator('.kcard', { hasText: `#${number}` })).toBeVisible()
  await expect(column(kitchen.page, 'Novos').locator('.kcard')).toHaveCount(0)

  await kitchen.context.close()
})

test('cupom inválido é explicado ao cliente e não altera o total', async ({ page }) => {
  await page.goto('/')
  await addSimple(page)
  await goToCheckout(page)

  await page.getByLabel('Cupom de desconto').fill('NAOEXISTE')
  await page.getByRole('button', { name: 'Aplicar' }).click()
  await expect(page.getByRole('alert')).toContainText('Cupom inválido')
  await expect(page.locator('.totals')).toContainText('R$ 14,90')

  await page.getByLabel('Cupom de desconto').fill('LANCHE5') // exige pedido mínimo de R$ 30
  await page.getByRole('button', { name: 'Aplicar' }).click()
  await expect(page.getByRole('alert')).toContainText('mínimo')
})

async function addSimple(page: import('@playwright/test').Page) {
  await page.getByRole('button', { name: 'Comer aqui' }).click()
  await page.getByRole('button', { name: 'Acompanhamentos' }).click()
  await page.locator('button.product', { hasText: 'Batata Frita' }).click()
}
