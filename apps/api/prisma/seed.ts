import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const categories = [
  { id: 'burgers', label: 'Hambúrgueres', emoji: '🍔', position: 0 },
  { id: 'combos', label: 'Combos', emoji: '🍟', position: 1 },
  { id: 'sides', label: 'Acompanhamentos', emoji: '🧅', position: 2 },
  { id: 'drinks', label: 'Bebidas', emoji: '🥤', position: 3 },
  { id: 'desserts', label: 'Sobremesas', emoji: '🍦', position: 4 },
]

const burgerExtras = (pid: string) => [
  { id: `${pid}-bacon`, name: 'Bacon crocante', priceCents: 400 },
  { id: `${pid}-cheddar`, name: 'Cheddar extra', priceCents: 300 },
  { id: `${pid}-egg`, name: 'Ovo', priceCents: 250 },
  { id: `${pid}-patty`, name: 'Hambúrguer extra', priceCents: 700 },
]

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

async function main() {
  for (const c of categories) {
    await prisma.category.upsert({ where: { id: c.id }, update: c, create: c })
  }
  for (const { extras, ...p } of products) {
    await prisma.product.upsert({ where: { id: p.id }, update: p, create: p })
    if (extras) {
      for (const e of burgerExtras(p.id)) {
        await prisma.extra.upsert({ where: { id: e.id }, update: e, create: { ...e, productId: p.id } })
      }
    }
  }
  console.log('Seed concluído')
}

main().finally(() => prisma.$disconnect())
