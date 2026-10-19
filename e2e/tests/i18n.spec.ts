import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { resetState } from '../support/helpers'

test.beforeEach(resetState)

async function scan(page: Page, where: string) {
  const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
  const report = violations.map((v) => `[${v.impact}] ${v.id}: ${v.help}\n    ${v.nodes.slice(0, 4).map((n) => n.target.join(' ')).join('\n    ')}`).join('\n')
  expect(violations, `${where}\n${report}`).toEqual([])
}

test('pedido em inglês: telas, cardápio traduzido e volta ao português no próximo cliente', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'English' }).click()
  await expect(page.getByRole('button', { name: 'Eat here' })).toBeVisible()
  await expect(page.locator('html')).toHaveAttribute('lang', 'en')

  await page.getByRole('button', { name: 'Eat here' }).click()
  await expect(page.getByRole('button', { name: 'Go to payment' })).toBeDisabled()
  await expect(page.getByText('Tap an item to add it.')).toBeVisible()
  await expect(page.getByRole('navigation', { name: 'Categories' })).toBeVisible()

  await page.getByRole('button', { name: /Cancel order/ }).click()
  // Voltou à tela inicial: o idioma é redefinido para o próximo cliente.
  await expect(page.getByRole('button', { name: 'Comer aqui' })).toBeVisible()
  await expect(page.locator('html')).toHaveAttribute('lang', 'pt-BR')
})

test('alto contraste e texto maior ligam e desligam, e passam no axe', async ({ page }) => {
  await page.goto('/')
  const html = page.locator('html')

  await page.getByRole('button', { name: /Alto contraste/ }).click()
  await expect(html).toHaveClass(/hc/)
  await scan(page, 'boas-vindas em alto contraste')

  await page.getByRole('button', { name: /Texto maior/ }).click()
  await expect(html).toHaveClass(/big/)

  await page.getByRole('button', { name: 'Comer aqui' }).click()
  await expect(page.locator('button.product').first()).toBeVisible()
  await scan(page, 'cardápio em alto contraste')
})
