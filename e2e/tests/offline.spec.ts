import { expect, test } from '@playwright/test'
import { addSimpleProduct, column, findOrder, openStaff, resetState } from '../support/helpers'

test.beforeEach(resetState)

test('PWA offline: o totem abre sem rede, aceita pedido no cartão e sincroniza ao voltar', async ({ page, context, browser, request }) => {
  // 1) Online: carrega, deixa o service worker assumir e guarda o cardápio.
  await page.goto('/')
  await page.evaluate(() => navigator.serviceWorker.ready)
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller), { timeout: 15_000 }).toBe(true)
  await page.getByRole('button', { name: 'Comer aqui' }).click()
  await expect(page.locator('button.product').first()).toBeVisible()

  // 2) Cai a rede e recarrega: o app shell vem do service worker.
  await context.setOffline(true)
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Burger Lab' })).toBeVisible()
  await expect(page.getByRole('status')).toContainText('Sem conexão')

  // 3) Cardápio offline (última cópia), Pix indisponível, cartão aceito e enfileirado.
  await addSimpleProduct(page, 'Acompanhamentos', 'Batata Frita')
  await page.getByRole('button', { name: 'Ir para pagamento' }).click()
  await expect(page.getByRole('button', { name: /Pix/ })).toBeDisabled()
  await page.getByRole('button', { name: /Cartão/ }).click()
  await page.getByRole('button', { name: 'Simular pagamento no cartão' }).click()

  await expect(page.getByText('Estamos sem conexão. Informe este código no balcão:')).toBeVisible({ timeout: 15_000 })
  const code = (await page.locator('.ticket strong').innerText()).trim()
  expect(code).toMatch(/^[A-Z2-9]{4}$/)
  expect(await findOrder(request, (o) => o.clientRef === code)).toBeUndefined() // ainda só na fila local

  // 4) A rede volta: a fila sincroniza e o pedido chega à cozinha com o código.
  const kitchen = await openStaff(browser, 'kitchen')
  await context.setOffline(false)
  await expect.poll(() => findOrder(request, (o) => o.clientRef === code), { timeout: 30_000 }).toBeTruthy()

  const card = column(kitchen.page, 'Novos').locator('.kcard', { hasText: `código ${code}` })
  await expect(card).toBeVisible()
  await expect(card).toContainText('Batata Frita')

  // Sem duplicar: exatamente um pedido com esse código.
  const token = await (await request.post('/api/auth/login', { data: { email: 'admin@burgerlab.dev', password: 'admin123' } })).json()
  const all = await (await request.get('/api/orders', { headers: { Authorization: `Bearer ${token.token}` } })).json()
  expect(all.filter((o: { clientRef: string }) => o.clientRef === code)).toHaveLength(1)

  await kitchen.context.close()
})
