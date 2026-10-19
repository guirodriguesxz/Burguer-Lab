import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { addSimpleProduct, goToCheckout, openStaff, resetState } from '../support/helpers'

/**
 * Acessibilidade automatizada (axe-core, WCAG 2.0/2.1 níveis A e AA) nas telas principais.
 * O axe acha os problemas mecânicos (contraste, nomes de controles, rótulos, ARIA inválido, ordem de títulos).
 * Ele não substitui um teste com leitor de tela e teclado de verdade; esses ficam no checklist do README.
 */
test.beforeEach(resetState)

async function scan(page: Page, where: string) {
  const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
  const report = violations.map((v) => `[${v.impact}] ${v.id}: ${v.help}\n    ${v.nodes.slice(0, 4).map((n) => n.target.join(' ')).join('\n    ')}`).join('\n')
  expect(violations, `${where}\n${report}`).toEqual([])
}

test.describe('totem do cliente', () => {
  test('boas-vindas, cardápio e personalização', async ({ page }) => {
    await page.goto('/')
    await scan(page, 'boas-vindas')
    await page.getByRole('button', { name: 'Comer aqui' }).click()
    await expect(page.locator('button.product').first()).toBeVisible()
    await scan(page, 'cardápio')

    await page.locator('button.product', { hasText: 'Clássico' }).click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await scan(page, 'personalização (diálogo)')
  })

  test('carrinho, sugestões e pagamento (cartão, Pix, caixa)', async ({ page }) => {
    await page.goto('/')
    await addSimpleProduct(page, 'Acompanhamentos', 'Batata Frita')
    await scan(page, 'cardápio com carrinho')

    await page.getByRole('button', { name: 'Ir para pagamento' }).click()
    await expect(page.getByRole('dialog', { name: 'Sugestões para seu pedido' })).toBeVisible()
    await scan(page, 'sugestões (diálogo)')
    await page.getByRole('button', { name: 'Não, obrigado' }).click()

    await expect(page.getByRole('heading', { name: 'Pagamento' })).toBeVisible()
    await scan(page, 'pagamento')
    await page.getByRole('button', { name: /Cartão/ }).click()
    await scan(page, 'pagamento no cartão')
    await page.getByRole('button', { name: /No caixa/ }).click()
    await scan(page, 'pagamento no caixa')
    await page.getByRole('button', { name: /Pix/ }).click()
    await page.getByRole('button', { name: 'Gerar QR Code Pix' }).click()
    await expect(page.getByRole('img', { name: 'QR Code Pix para pagamento' })).toBeVisible()
    await scan(page, 'Pix com QR Code')
  })

  test('pedido concluído', async ({ page }) => {
    await page.goto('/')
    await addSimpleProduct(page, 'Acompanhamentos', 'Batata Frita')
    await goToCheckout(page)
    await page.getByRole('button', { name: /Cartão/ }).click()
    await page.getByRole('button', { name: 'Simular pagamento no cartão' }).click()
    await expect(page.getByRole('heading', { name: 'Pedido confirmado!' })).toBeVisible({ timeout: 15_000 })
    await scan(page, 'pedido concluído')
  })

  test('tela de senhas (televisão)', async ({ page }) => {
    await page.goto('/#/senhas')
    await expect(page.getByRole('heading', { name: 'Em preparo' })).toBeVisible()
    await scan(page, 'tela de senhas')
  })
})

test.describe('app da equipe', () => {
  test('login, esqueci a senha e nova senha', async ({ page }) => {
    await page.goto('/admin/')
    await expect(page.getByRole('button', { name: 'Entrar' })).toBeVisible()
    await scan(page, 'login')
    await page.getByRole('button', { name: 'Esqueci minha senha' }).click()
    await scan(page, 'esqueci minha senha')
    await page.goto(`/admin/?reset=${'ab'.repeat(32)}`)
    await expect(page.getByRole('heading', { name: 'Nova senha' })).toBeVisible()
    await scan(page, 'nova senha')
  })

  test('cozinha e caixa', async ({ browser }) => {
    const kitchen = await openStaff(browser, 'kitchen')
    await scan(kitchen.page, 'cozinha')
    await kitchen.context.close()
    const cashier = await openStaff(browser, 'cashier')
    await scan(cashier.page, 'caixa')
    await cashier.context.close()
  })

  test('telas de gestão do administrador', async ({ browser }) => {
    const admin = await openStaff(browser, 'admin')
    const go = async (tab: RegExp, heading: string | RegExp, label: string) => {
      await admin.page.getByRole('button', { name: tab }).click()
      await expect(admin.page.getByRole('heading', { name: heading, level: 1 })).toBeVisible()
      await scan(admin.page, label)
    }
    await go(/Pedidos/, 'Pedidos', 'pedidos')
    await go(/Cardápio/, 'Cardápio', 'cardápio')
    await go(/Cupons/, 'Cupons', 'cupons')
    await go(/Relatórios/, 'Relatórios', 'relatórios')
    await go(/Usuários/, 'Usuários', 'usuários')
    await go(/Auditoria/, 'Auditoria', 'auditoria')
    await admin.context.close()
  })

  test('diálogos do administrador: editor de produto e minha senha', async ({ browser }) => {
    const admin = await openStaff(browser, 'admin')
    await admin.page.getByRole('button', { name: /Cardápio/ }).click()
    await admin.page.getByRole('button', { name: /Novo produto/ }).click()
    await expect(admin.page.getByRole('dialog', { name: 'Novo produto' })).toBeVisible()
    await scan(admin.page, 'editor de produto')
    await admin.page.getByRole('button', { name: 'Cancelar' }).click()

    await admin.page.getByRole('button', { name: 'Minha senha' }).click()
    await expect(admin.page.getByRole('dialog', { name: 'Alterar minha senha' })).toBeVisible()
    await scan(admin.page, 'minha senha')
    await admin.context.close()
  })
})

test.describe('teclado e foco', () => {
  const activeInside = (page: Page, selector: string) => page.evaluate((sel) => !!document.activeElement?.closest(sel), selector)

  test('totem: o diálogo recebe o foco, prende o Tab, fecha com Esc e devolve o foco ao produto', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: 'Comer aqui' }).click()
    const product = page.locator('button.product', { hasText: 'Clássico' })
    await product.focus()
    await page.keyboard.press('Enter')

    const dialog = page.getByRole('dialog', { name: /Personalizar Clássico/ })
    await expect(dialog).toBeVisible()
    expect(await activeInside(page, '[role="dialog"]')).toBe(true) // foco foi para dentro

    // Tab dá a volta sem escapar do diálogo (nem na frente nem atrás)
    for (let i = 0; i < 40; i++) {
      await page.keyboard.press('Tab')
      expect(await activeInside(page, '[role="dialog"]')).toBe(true)
    }
    for (let i = 0; i < 10; i++) {
      await page.keyboard.press('Shift+Tab')
      expect(await activeInside(page, '[role="dialog"]')).toBe(true)
    }

    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
    await expect(product).toBeFocused() // voltou para o botão que abriu
  })

  test('totem: no diálogo de sugestões, Esc equivale a "Não, obrigado"', async ({ page }) => {
    await page.goto('/')
    await addSimpleProduct(page, 'Acompanhamentos', 'Batata Frita')
    await page.getByRole('button', { name: 'Ir para pagamento' }).click()
    await expect(page.getByRole('dialog', { name: 'Sugestões para seu pedido' })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('heading', { name: 'Pagamento' })).toBeVisible()
  })

  test('totem: o carrinho é anunciado a leitores de tela', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: 'Comer aqui' }).click()
    const live = page.locator('[role="status"][aria-live="polite"]').first()
    await expect(live).toHaveText('Seu pedido está vazio')
    await page.getByRole('button', { name: 'Acompanhamentos' }).click()
    await page.locator('button.product', { hasText: 'Batata Frita' }).click()
    await expect(live).toContainText('1 item no pedido, total R$')
  })

  test('admin: diálogos fecham com Esc, prendem o foco e devolvem o foco ao botão', async ({ browser }) => {
    const admin = await openStaff(browser, 'admin')
    const trigger = admin.page.getByRole('button', { name: 'Minha senha' })
    await trigger.focus()
    await admin.page.keyboard.press('Enter')
    const dialog = admin.page.getByRole('dialog', { name: 'Alterar minha senha' })
    await expect(dialog).toBeVisible()
    expect(await activeInside(admin.page, '[role="dialog"]')).toBe(true)
    for (let i = 0; i < 15; i++) {
      await admin.page.keyboard.press('Tab')
      expect(await activeInside(admin.page, '[role="dialog"]')).toBe(true)
    }
    await admin.page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
    await expect(trigger).toBeFocused()
    await admin.context.close()
  })

  test('tudo do totem é alcançável só pelo teclado (começar um pedido sem mouse)', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: 'Comer aqui' }).focus()
    await page.keyboard.press('Enter')
    await expect(page.locator('button.product').first()).toBeVisible()
    await page.getByRole('button', { name: 'Acompanhamentos' }).focus()
    await page.keyboard.press('Enter')
    await page.locator('button.product', { hasText: 'Batata Frita' }).focus()
    await page.keyboard.press('Enter')
    await expect(page.locator('.cart-footer')).toContainText('R$ 14,90')
    await page.getByRole('button', { name: 'Ir para pagamento' }).focus()
    await page.keyboard.press('Enter')
    await expect(page.getByRole('dialog', { name: 'Sugestões para seu pedido' })).toBeVisible() // vem de uma consulta ao servidor
    await page.keyboard.press('Escape') // dispensa as sugestões
    await expect(page.getByRole('heading', { name: 'Pagamento' })).toBeVisible()
  })
})
