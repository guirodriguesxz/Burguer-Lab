import { expect, test } from '@playwright/test'
import { CREDS, openStaff, resetState } from '../support/helpers'

test.beforeEach(resetState)

test('sessão em cookie HttpOnly: o JavaScript da página não enxerga o token em lugar nenhum', async ({ browser }) => {
  const admin = await openStaff(browser, 'admin')
  const visible = await admin.page.evaluate(() => ({
    cookie: document.cookie,
    local: JSON.stringify(Object.entries(localStorage)),
    session: JSON.stringify(Object.entries(sessionStorage)),
  }))
  expect(visible.cookie).not.toContain('bl_session')
  expect(visible.local + visible.session).not.toMatch(/eyJ|token|bl_session/i)

  // mas o navegador guarda o cookie, com os atributos de segurança
  const cookie = (await admin.context.cookies()).find((c) => c.name === 'bl_session')!
  expect(cookie).toMatchObject({ httpOnly: true, sameSite: 'Strict', path: '/' })

  // e a sessão sobrevive ao recarregar sem nada guardado no armazenamento local
  await admin.page.reload()
  await expect(admin.page.getByRole('button', { name: 'Sair' })).toBeVisible()
  await admin.context.close()
})

test('sair encerra a sessão no servidor: o cookie copiado antes não vale mais', async ({ browser, request }) => {
  const admin = await openStaff(browser, 'admin')
  const stolen = (await admin.context.cookies()).find((c) => c.name === 'bl_session')!

  // o cookie funciona enquanto a sessão existe
  const before = await request.get('/api/auth/me', { headers: { Cookie: `bl_session=${stolen.value}` } })
  expect(before.status()).toBe(200)

  await admin.page.getByRole('button', { name: 'Sair' }).click()
  await expect(admin.page.getByRole('button', { name: 'Entrar' })).toBeVisible()

  const after = await request.get('/api/auth/me', { headers: { Cookie: `bl_session=${stolen.value}` } })
  expect(after.status()).toBe(401) // revogado, mesmo sendo uma cópia do cookie original
  await admin.context.close()
})

test('CSRF: uma requisição que altera dados vinda de outro site (sem o cabeçalho) é bloqueada', async ({ browser, request }) => {
  const admin = await openStaff(browser, 'admin')
  const cookie = (await admin.context.cookies()).find((c) => c.name === 'bl_session')!

  // simula um formulário/fetch de outro site: manda o cookie, mas sem X-Requested-With
  const forged = await request.patch('/api/admin/products/classic', {
    headers: { Cookie: `bl_session=${cookie.value}` },
    data: { priceCents: 1 },
  })
  expect(forged.status()).toBe(403)

  const legit = await request.patch('/api/admin/products/classic', {
    headers: { Cookie: `bl_session=${cookie.value}`, 'X-Requested-With': 'XMLHttpRequest' },
    data: { priceCents: 2490 },
  })
  expect(legit.status()).toBe(200)
  await admin.context.close()
})

test('auditoria: mudança de preço aparece com quem fez, o valor antes e depois, e some com o filtro', async ({ browser }) => {
  const admin = await openStaff(browser, 'admin')
  await admin.page.getByRole('button', { name: /Cardápio/ }).click()
  // a linha do "Clássico" (e não a do "Combo Clássico"), localizada pelo campo de preço
  const classicRow = () => admin.page.getByRole('row').filter({ has: admin.page.getByLabel('Preço de Clássico', { exact: true }) })
  await classicRow().getByLabel('Preço de Clássico', { exact: true }).fill('27,90')
  await classicRow().getByRole('button', { name: 'Salvar', exact: true }).click()
  await expect(admin.page.getByRole('row', { name: /Alterou/ })).toHaveCount(0) // ainda na tela do cardápio

  await admin.page.getByRole('button', { name: /Auditoria/ }).click()
  const row = admin.page.getByRole('row', { name: /Alterou produto/ }).first()
  await expect(row).toBeVisible()
  await expect(row).toContainText(CREDS.admin.email)
  await expect(row).toContainText('priceCents: 2490 → 2790')

  // login do próprio admin também aparece; filtrar por tipo esconde o resto
  await expect(admin.page.getByRole('row', { name: /Entrou/ }).first()).toBeVisible()
  await admin.page.getByLabel('Tipo').selectOption('product.')
  await admin.page.getByRole('button', { name: 'Filtrar' }).click()
  await expect(admin.page.getByRole('row', { name: /Alterou produto/ })).toHaveCount(1)
  await expect(admin.page.getByRole('row', { name: /Entrou/ })).toHaveCount(0)

  // volta o preço (o E2E compartilha o cardápio)
  await admin.page.getByRole('button', { name: /Cardápio/ }).click()
  await classicRow().getByLabel('Preço de Clássico', { exact: true }).fill('24,90')
  await classicRow().getByRole('button', { name: 'Salvar', exact: true }).click()
  await admin.context.close()
})

test('só o admin vê a aba de auditoria', async ({ browser }) => {
  const kitchen = await openStaff(browser, 'kitchen')
  await expect(kitchen.page.getByRole('button', { name: /Auditoria/ })).toHaveCount(0)
  await kitchen.context.close()

  const admin = await openStaff(browser, 'admin')
  await expect(admin.page.getByRole('button', { name: /Auditoria/ })).toBeVisible()
  await admin.context.close()
})
