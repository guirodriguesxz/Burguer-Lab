import { expect, test } from '@playwright/test'
import { addSimpleProduct, column, findOrder, goToCheckout, openStaff, resetState, sendPixWebhook, ticketNumber } from '../support/helpers'

test.beforeEach(resetState)

test('Pix: QR Code, cozinha só vê após o webhook assinado, e o totem confirma sozinho', async ({ page, browser, request }) => {
  const kitchen = await openStaff(browser, 'kitchen')

  await page.goto('/')
  await addSimpleProduct(page, 'Acompanhamentos', 'Batata Frita')
  await goToCheckout(page)
  await page.getByRole('button', { name: /Pix/ }).click()
  await page.getByRole('button', { name: 'Gerar QR Code Pix' }).click()

  await expect(page.getByRole('img', { name: 'QR Code Pix para pagamento' })).toBeVisible()
  await expect(page.getByText(/Expira em \d:\d\d/)).toBeVisible()

  // Enquanto não paga, o pedido existe (CREATED) mas a cozinha não o vê.
  const pending = await findOrder(request, (o) => o.status === 'CREATED')
  expect(pending.payment).toMatchObject({ method: 'PIX', status: 'PENDING', amountCents: 1490 })
  await expect(kitchen.page.locator('.kcard')).toHaveCount(0)

  // Webhook falsificado é recusado e não confirma nada.
  const forged = await sendPixWebhook(request, pending.payment.txid, 1490, 'a'.repeat(64))
  expect(forged.status()).toBe(401)
  await expect(page.getByRole('heading', { name: 'Pedido confirmado!' })).toBeHidden()

  // Webhook legítimo do provedor.
  const ok = await sendPixWebhook(request, pending.payment.txid, 1490)
  expect(ok.status()).toBe(200)

  const number = await ticketNumber(page) // o totem detecta o pagamento sozinho
  await expect(column(kitchen.page, 'Novos').locator('.kcard', { hasText: `#${number}` })).toBeVisible()

  // Reenvio do mesmo evento (comum em PSPs) é inofensivo.
  const again = await sendPixWebhook(request, pending.payment.txid, 1490)
  expect((await again.json()).alreadyProcessed).toBe(true)
  await expect(kitchen.page.locator('.kcard')).toHaveCount(1)

  await kitchen.context.close()
})
