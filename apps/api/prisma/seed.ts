import { PrismaClient } from '@prisma/client'
import * as bcrypt from 'bcryptjs'
import { demoLogins, demoRole, isDemoMode } from '../src/demo/demo'
import { seedDemoOrders } from './demo-orders'

const prisma = new PrismaClient()

const categories = [
  { id: 'burgers', label: 'Hambúrgueres', emoji: '🍔', position: 0 },
  { id: 'combos', label: 'Combos', emoji: '🍟', position: 1 },
  { id: 'sides', label: 'Acompanhamentos', emoji: '🧅', position: 2 },
  { id: 'drinks', label: 'Bebidas', emoji: '🥤', position: 3 },
  { id: 'desserts', label: 'Sobremesas', emoji: '🍦', position: 4 },
]

const burgerExtras = (pid: string) => [
  { id: `${pid}-bacon`, name: 'Bacon crocante', nameEn: 'Crispy bacon', priceCents: 400 },
  { id: `${pid}-cheddar`, name: 'Cheddar extra', nameEn: 'Extra cheddar', priceCents: 300 },
  { id: `${pid}-egg`, name: 'Ovo', nameEn: 'Egg', priceCents: 250 },
  { id: `${pid}-patty`, name: 'Hambúrguer extra', nameEn: 'Extra patty', priceCents: 700 },
]

// Tradução do cardápio de exemplo para o totem em inglês (o admin edita estes textos pela tela de cardápio).
const categoriesEn: Record<string, string> = {
  burgers: 'Burgers',
  combos: 'Combos',
  sides: 'Sides',
  drinks: 'Drinks',
  desserts: 'Desserts',
}
const productsEn: Record<string, { name: string; description: string }> = {
  classic: { name: 'Classic', description: '150g patty, cheese, lettuce, tomato and house mayo.' },
  bacon: { name: 'Bacon Smash', description: 'Two smash patties, cheddar, bacon and barbecue sauce.' },
  chicken: { name: 'Crispy Chicken', description: 'Breaded chicken, iceberg lettuce and ranch sauce.' },
  veggie: { name: 'Veggie', description: 'Chickpea patty, arugula and herb mayo.' },
  'combo-classic': { name: 'Classic Combo', description: 'Classic + medium fries + 500ml soda.' },
  'combo-bacon': { name: 'Bacon Smash Combo', description: 'Bacon Smash + medium fries + 500ml soda.' },
  fries: { name: 'French Fries', description: 'Medium portion, crispy and dry.' },
  onion: { name: 'Onion Rings', description: '8 breaded onion rings.' },
  nuggets: { name: 'Nuggets (10)', description: 'With your choice of sauce.' },
  cola: { name: 'Soda 500ml', description: 'Cola, guarana or lemon.' },
  juice: { name: 'Fresh Juice', description: 'Orange or passion fruit, 400ml.' },
  shake: { name: 'Milkshake', description: 'Chocolate, strawberry or vanilla.' },
  sundae: { name: 'Sundae', description: 'Vanilla ice cream with your choice of syrup.' },
  brownie: { name: 'Brownie', description: 'Warm brownie with ice cream.' },
}

const products = [
  { id: 'classic', name: 'Clássico', description: 'Blend 150g, queijo prato, alface, tomate e maionese da casa.', priceCents: 2490, categoryId: 'burgers', emoji: '🍔', stock: 50, extras: true, removable: ['Alface', 'Tomate', 'Cebola', 'Maionese'] },
  { id: 'bacon', name: 'Bacon Smash', description: 'Dois smashes, cheddar, bacon e molho barbecue.', priceCents: 3290, categoryId: 'burgers', emoji: '🥓', stock: 40, extras: true, removable: ['Cebola', 'Barbecue', 'Picles'] },
  { id: 'chicken', name: 'Crispy Chicken', description: 'Frango empanado, alface americana e molho ranch.', priceCents: 2790, categoryId: 'burgers', emoji: '🍗', stock: 40, extras: true, removable: ['Alface', 'Ranch'] },
  { id: 'veggie', name: 'Veggie', description: 'Burger de grão-de-bico, rúcula e maionese de ervas.', priceCents: 2990, categoryId: 'burgers', emoji: '🥬', stock: 25, extras: true, removable: ['Rúcula', 'Maionese'] },
  { id: 'combo-classic', name: 'Combo Clássico', description: 'Clássico + batata média + refrigerante 500ml.', priceCents: 3990, categoryId: 'combos', emoji: '🍟', stock: 40, removable: [] },
  { id: 'combo-bacon', name: 'Combo Bacon Smash', description: 'Bacon Smash + batata média + refrigerante 500ml.', priceCents: 4790, categoryId: 'combos', emoji: '🍟', stock: 30, removable: [] },
  { id: 'fries', name: 'Batata Frita', description: 'Porção média, crocante e sequinha.', priceCents: 1490, categoryId: 'sides', emoji: '🍟', stock: 100, removable: [] },
  { id: 'onion', name: 'Onion Rings', description: '8 anéis de cebola empanados.', priceCents: 1690, categoryId: 'sides', emoji: '🧅', stock: 60, removable: [] },
  { id: 'nuggets', name: 'Nuggets (10un)', description: 'Com molho à sua escolha.', priceCents: 1990, categoryId: 'sides', emoji: '🍗', stock: 60, removable: [] },
  { id: 'cola', name: 'Refrigerante 500ml', description: 'Cola, guaraná ou limão.', priceCents: 890, categoryId: 'drinks', emoji: '🥤', stock: null, removable: [] },
  { id: 'juice', name: 'Suco Natural', description: 'Laranja ou maracujá, 400ml.', priceCents: 1090, categoryId: 'drinks', emoji: '🍊', stock: 30, removable: [] },
  { id: 'shake', name: 'Milk Shake', description: 'Chocolate, morango ou baunilha.', priceCents: 1890, categoryId: 'drinks', emoji: '🥛', stock: 30, removable: [] },
  { id: 'sundae', name: 'Sundae', description: 'Sorvete de baunilha com calda à escolha.', priceCents: 1190, categoryId: 'desserts', emoji: '🍨', stock: 40, removable: [] },
  // Estoque baixo de propósito, para demonstrar o bloqueio de itens esgotados.
  { id: 'brownie', name: 'Brownie', description: 'Brownie quente com sorvete.', priceCents: 1590, categoryId: 'desserts', emoji: '🍫', stock: 3, removable: [] },
]

const coupons = [
  { code: 'BEMVINDO10', type: 'PERCENT' as const, value: 10 },
  { code: 'LANCHE5', type: 'FIXED' as const, value: 500, minOrderCents: 3000 },
  { code: 'ULTIMO', type: 'PERCENT' as const, value: 50, maxUses: 1 },
]

// Em produção nunca cria as contas de demonstração: exige ADMIN_EMAIL/ADMIN_PASSWORD (e KITCHEN_* opcionais).
// Fora de produção usa credenciais de desenvolvimento local.
const isProd = process.env.NODE_ENV === 'production'

function buildUsers() {
  if (!isProd) {
    return [
      { email: 'admin@burgerlab.dev', name: 'Admin', password: 'admin123', role: 'ADMIN' as const },
      { email: 'cozinha@burgerlab.dev', name: 'Cozinha', password: 'cozinha123', role: 'KITCHEN' as const },
      { email: 'caixa@burgerlab.dev', name: 'Caixa', password: 'caixa123', role: 'CASHIER' as const },
    ]
  }
  const { ADMIN_EMAIL, ADMIN_PASSWORD, KITCHEN_EMAIL, KITCHEN_PASSWORD, CASHIER_EMAIL, CASHIER_PASSWORD } = process.env
  if (!ADMIN_EMAIL || !ADMIN_PASSWORD) throw new Error('Defina ADMIN_EMAIL e ADMIN_PASSWORD para o seed de produção')
  if (ADMIN_PASSWORD.length < 12) throw new Error('ADMIN_PASSWORD deve ter ao menos 12 caracteres')
  const list: { email: string; name: string; password: string; role: 'ADMIN' | 'KITCHEN' | 'CASHIER' }[] = [
    { email: ADMIN_EMAIL, name: 'Admin', password: ADMIN_PASSWORD, role: 'ADMIN' },
  ]
  if (KITCHEN_EMAIL && KITCHEN_PASSWORD) {
    list.push({ email: KITCHEN_EMAIL, name: 'Cozinha', password: KITCHEN_PASSWORD, role: 'KITCHEN' as const })
  }
  if (CASHIER_EMAIL && CASHIER_PASSWORD) {
    list.push({ email: CASHIER_EMAIL, name: 'Caixa', password: CASHIER_PASSWORD, role: 'CASHIER' })
  }
  return list
}
const users = buildUsers()

/**
 * Modo demonstração: garante as contas de DEMO_LOGINS com a senha publicada na tela de login. Diferente das contas
 * reais, estas são redefinidas a cada início (a senha é pública e qualquer visitante pode ter mudado). Nunca toca
 * numa conta real: se o e-mail for o de ADMIN/KITCHEN/CASHIER_EMAIL, é ignorada.
 */
async function seedDemoUsers() {
  const real = new Set([process.env.ADMIN_EMAIL, process.env.KITCHEN_EMAIL, process.env.CASHIER_EMAIL].filter(Boolean))
  for (const d of demoLogins()) {
    const role = demoRole(d.label)
    if (!role || real.has(d.email)) {
      console.warn('Conta de demonstração ignorada:', d.label)
      continue
    }
    const passwordHash = await bcrypt.hash(d.password, 10)
    await prisma.user.upsert({
      where: { email: d.email },
      update: { name: d.label, role, passwordHash, active: true, tokenVersion: { increment: 1 } },
      create: { email: d.email, name: d.label, role, passwordHash },
    })
    console.log('Conta de demonstração pronta:', d.label)
  }
}

async function main() {
  await seedDemoUsers()
  for (const u of users) {
    const passwordHash = await bcrypt.hash(u.password, 10)
    await prisma.user.upsert({
      where: { email: u.email },
      // Em produção só cria: reiniciar o container não pode desfazer uma senha redefinida pelo próprio usuário.
      update: isProd ? {} : { name: u.name, role: u.role, passwordHash },
      create: { email: u.email, name: u.name, role: u.role, passwordHash },
    })
  }
  if (!isProd) {
    for (const c of coupons) {
      await prisma.coupon.upsert({ where: { code: c.code }, update: {}, create: c })
    }
  }
  for (const c of categories) {
    const data = { ...c, labelEn: categoriesEn[c.id] ?? null }
    await prisma.category.upsert({ where: { id: c.id }, update: data, create: data })
  }
  for (const { extras, ...p } of products) {
    // Em re-execuções não sobrescreve o estoque atual.
    const { stock: _stock, ...rest } = p
    const en = productsEn[p.id]
    const translation = { nameEn: en?.name ?? null, descriptionEn: en?.description ?? null }
    await prisma.product.upsert({ where: { id: p.id }, update: { ...rest, ...translation }, create: { ...p, ...translation } })
    if (extras) {
      for (const e of burgerExtras(p.id)) {
        await prisma.extra.upsert({ where: { id: e.id }, update: e, create: { ...e, productId: p.id } })
      }
    }
  }
  if (isDemoMode()) {
    // Vitrine: cupons e 14 dias de pedidos de exemplo para os relatórios e o histórico não nascerem vazios.
    for (const c of coupons.filter((x) => !x.maxUses)) {
      await prisma.coupon.upsert({ where: { code: c.code }, update: {}, create: c })
    }
    console.log('Pedidos de demonstração:', await seedDemoOrders(prisma))
  }
  console.log('Seed concluído')
}

main().finally(() => prisma.$disconnect())
