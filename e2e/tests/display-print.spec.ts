import { expect, test } from '@playwright/test'
import { addSimpleProduct, column, goToCheckout, openStaff, resetState } from '../support/helpers'

test.beforeEach(resetState)

async function payByCard(page: import('@playwright/test').Page) {
  await goToCheckout(page)
  await page.getByRole('button', { name: /Cartão/ }).click()
  await page.getByRole('button', { name: 'Simular pagamento no cartão' }).click()
  await expect(page.getByRole('heading', { name: 'Pedido confirmado!' })).toBeVisible({ timeout: 15_000 })
}

test('senha diária: o primeiro pedido do dia é a senha 1 e a sequência segue', async ({ page }) => {
  await page.goto('/')
  await addSimpleProduct(page, 'Acompanhamentos', 'Batata Frita')
  await payByCard(page)
  await expect(page.locator('.ticket strong')).toHaveText('1')

  await page.getByRole('button', { name: /Novo pedido/ }).click()
  await addSimpleProduct(page, 'Acompanhamentos', 'Batata Frita')
  await payByCard(page)
  await expect(page.locator('.ticket strong')).toHaveText('2')
})

test('tela de senhas acompanha o pedido ao vivo: preparando → pronto', async ({ page, browser }) => {
  const display = await browser.newPage({ baseURL: 'http://localhost:3100' })
  await display.goto('/#/senhas')
  await expect(display.getByRole('heading', { name: 'Em preparo' })).toBeVisible()
  const preparing = display.getByLabel('Em preparo')
  const ready = display.getByLabel('Pronto para retirar')

  const kitchen = await openStaff(browser, 'kitchen')
  await page.goto('/')
  await addSimpleProduct(page, 'Acompanhamentos', 'Batata Frita')
  await payByCard(page)

  // aparece em "Em preparo" assim que o pedido é pago
  await expect(preparing.getByText('1', { exact: true })).toBeVisible()
  await expect(ready.getByText('1', { exact: true })).toHaveCount(0)

  await column(kitchen.page, 'Novos').getByRole('button', { name: 'Preparar' }).click()
  await column(kitchen.page, 'Preparando').getByRole('button', { name: /Pronto/ }).click()

  // vai para "Pronto" e sai de "Em preparo", sem recarregar
  await expect(ready.getByText('1', { exact: true })).toBeVisible()
  await expect(preparing.getByText('1', { exact: true })).toHaveCount(0)

  // entregue: sai da tela
  await column(kitchen.page, 'Prontos').getByRole('button', { name: 'Entregue' }).click()
  await expect(ready.getByText('1', { exact: true })).toHaveCount(0)

  await display.close()
  await kitchen.context.close()
})

test('a tela de senhas não expõe itens, valores nem dados do pedido', async ({ page, browser }) => {
  const display = await browser.newPage({ baseURL: 'http://localhost:3100' })
  await display.goto('/#/senhas')

  await page.goto('/')
  await addSimpleProduct(page, 'Acompanhamentos', 'Batata Frita')
  await payByCard(page)

  await expect(display.getByLabel('Em preparo').getByText('1', { exact: true })).toBeVisible()
  const text = await display.locator('main').innerText()
  expect(text).not.toMatch(/Batata|R\$|Cartão/)
  await display.close()
})

test('imprimir senha: o comprovante só aparece no modo de impressão e traz itens e total', async ({ page }) => {
  await page.addInitScript(() => {
    ;(window as unknown as { __printed: number }).__printed = 0
    window.print = () => void ((window as unknown as { __printed: number }).__printed += 1)
  })
  await page.goto('/')
  await addSimpleProduct(page, 'Acompanhamentos', 'Batata Frita')
  await payByCard(page)

  const ticket = page.locator('.print-ticket')
  await expect(ticket).toBeHidden() // na tela, escondido

  await page.getByRole('button', { name: /Imprimir senha/ }).click()
  expect(await page.evaluate(() => (window as unknown as { __printed: number }).__printed)).toBe(1)

  await page.emulateMedia({ media: 'print' })
  await expect(ticket).toBeVisible()
  await expect(ticket).toContainText('SENHA')
  await expect(ticket).toContainText('1x Batata Frita')
  await expect(ticket).toContainText('R$ 14,90')
  await expect(ticket).toContainText('Cartão')
  await expect(page.getByRole('button', { name: /Imprimir senha/ })).not.toBeInViewport() // o resto some na impressão
})

test('imprimir comanda na cozinha: abre a impressão com itens, adicionais e remoções', async ({ page, browser }) => {
  const kitchen = await openStaff(browser, 'kitchen')
  await kitchen.page.addInitScript(() => void (window.print = () => void ((window as unknown as { __printed: number }).__printed = 1)))
  await kitchen.page.evaluate(() => {
    window.print = () => void ((window as unknown as { __printed: number }).__printed = 1)
  })

  await page.goto('/')
  await page.getByRole('button', { name: 'Comer aqui' }).click()
  await page.locator('button.product', { hasText: 'Clássico' }).click()
  await page.getByRole('button', { name: /Bacon crocante/ }).click()
  await page.getByRole('button', { name: /Sem Cebola/ }).click()
  await page.getByRole('button', { name: /Adicionar · / }).click()
  await payByCard(page)

  const card = column(kitchen.page, 'Novos').locator('.kcard', { hasText: '#1' })
  await expect(card).toBeVisible()
  await card.getByRole('button', { name: /Imprimir comanda #1/ }).click()

  const comanda = kitchen.page.locator('.print-area')
  await expect(comanda).toHaveCount(1)
  await kitchen.page.emulateMedia({ media: 'print' })
  await expect(comanda).toBeVisible()
  await expect(comanda).toContainText('COMANDA #1')
  await expect(comanda).toContainText('1x Clássico')
  await expect(comanda).toContainText('+ Bacon crocante')
  await expect(comanda).toContainText('SEM Cebola')
  await expect(kitchen.page.locator('#root')).toBeHidden() // a tela do admin não sai na impressão
  await kitchen.context.close()
})
