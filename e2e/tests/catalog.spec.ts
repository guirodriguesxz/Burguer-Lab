import { expect, test } from '@playwright/test'
import { PrismaClient } from '@prisma/client'
import { E2E_DB } from '../playwright.config'
import { openStaff, resetState } from '../support/helpers'

const db = new PrismaClient({ datasources: { db: { url: E2E_DB } } })
const NAME = 'X-Costela E2E'

async function cleanup() {
  await db.$executeRawUnsafe(`DELETE FROM "Extra" WHERE "productId" IN (SELECT id FROM "Product" WHERE name = '${NAME}')`)
  await db.$executeRawUnsafe(`DELETE FROM "OrderItem" WHERE "productName" = '${NAME}'`)
  await db.$executeRawUnsafe(`DELETE FROM "Product" WHERE name = '${NAME}'`)
}

test.beforeEach(async () => {
  await resetState()
  await cleanup()
})
test.afterAll(async () => {
  await cleanup()
  await db.$disconnect()
})

test('cadastro: cria produto com adicional, o totem mostra ao vivo, vende com o adicional e a exclusão tira do cardápio', async ({ page, browser }) => {
  // Totem aberto no cardápio, antes de o produto existir.
  await page.goto('/')
  await page.getByRole('button', { name: 'Comer aqui' }).click()
  await expect(page.locator('button.product', { hasText: NAME })).toHaveCount(0)

  const admin = await openStaff(browser, 'admin')
  await admin.page.getByRole('button', { name: /Cardápio/ }).click()
  await admin.page.getByRole('button', { name: /Novo produto/ }).click()

  const editor = admin.page.getByRole('dialog', { name: 'Novo produto' })
  await editor.getByLabel('Nome').fill(NAME)
  await editor.getByLabel('Descrição').fill('Costela desfiada e cheddar')
  await editor.getByLabel('Categoria').selectOption({ label: '🍔 Hambúrgueres' })
  await editor.getByLabel('Preço (R$)').fill('34,90')
  await editor.getByLabel('Estoque').fill('10')
  await editor.getByLabel('Ingredientes que o cliente pode tirar').fill('Cebola crispy')
  await editor.getByLabel('Ingredientes que o cliente pode tirar').press('Enter')
  await editor.getByRole('button', { name: 'Criar produto' }).click()

  // Com o produto salvo, aparecem os adicionais.
  await expect(editor.getByRole('heading', { name: 'Adicionais' })).toBeVisible()
  await editor.getByLabel('Nome do novo adicional').fill('Molho da casa')
  await editor.getByLabel('Preço do novo adicional').fill('2,50')
  await editor.getByRole('button', { name: 'Adicionar', exact: true }).click()
  await expect(editor.getByLabel('Preço de Molho da casa')).toHaveValue('2.50')
  await editor.getByRole('button', { name: 'Fechar' }).click()

  // O totem, sem recarregar, já mostra o produto.
  const card = page.locator('button.product', { hasText: NAME })
  await expect(card).toBeVisible()
  await expect(card).toContainText('R$ 34,90')

  // Pedido com o adicional e sem o ingrediente.
  await card.click()
  await page.getByRole('button', { name: /Molho da casa/ }).click()
  await page.getByRole('button', { name: /Sem Cebola crispy/ }).click()
  await page.getByRole('button', { name: /Adicionar · R\$\s*37,40/ }).click() // 34,90 + 2,50
  await expect(page.locator('.cart-footer')).toContainText('R$ 37,40')

  // Excluir: some do totem na hora.
  await admin.page.getByRole('button', { name: `Editar ${NAME}` }).click()
  admin.page.once('dialog', (d) => d.accept())
  await admin.page.getByRole('button', { name: 'Excluir produto' }).click()
  await expect(admin.page.getByRole('row', { name: new RegExp(NAME) })).toHaveCount(0)
  await expect(page.locator('button.product', { hasText: NAME })).toHaveCount(0)

  // Dá para ver e restaurar nos excluídos (volta pausado).
  await admin.page.getByRole('button', { name: 'Ver excluídos' }).click()
  const archived = admin.page.getByRole('row', { name: new RegExp(NAME) })
  await expect(archived).toBeVisible()
  await archived.getByRole('button', { name: 'Restaurar' }).click()
  await expect(archived).toHaveCount(0)
  await admin.page.getByRole('button', { name: /Voltar ao cardápio/ }).click()
  await expect(admin.page.getByRole('row', { name: new RegExp(NAME) })).toContainText('Pausado')

  await admin.context.close()
})

test('cadastro: dados inválidos mostram o erro do servidor e nada é criado', async ({ browser }) => {
  const admin = await openStaff(browser, 'admin')
  await admin.page.getByRole('button', { name: /Cardápio/ }).click()
  await admin.page.getByRole('button', { name: /Novo produto/ }).click()

  const editor = admin.page.getByRole('dialog', { name: 'Novo produto' })
  await editor.getByLabel('Nome').fill(NAME)
  await editor.getByLabel('Preço (R$)').fill('0')
  await editor.getByRole('button', { name: 'Criar produto' }).click()
  await expect(editor.getByRole('alert')).toBeVisible()
  await expect(editor.getByRole('heading', { name: 'Adicionais' })).toHaveCount(0) // não foi criado
  expect(await db.product.count({ where: { name: NAME } })).toBe(0)
  await admin.context.close()
})
