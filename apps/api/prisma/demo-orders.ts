import { randomUUID } from 'node:crypto'
import type { Prisma, PrismaClient } from '@prisma/client'

/**
 * Histórico de pedidos de exemplo para a vitrine (modo demonstração): os relatórios e o histórico do painel
 * nascem populados. É regenerado a cada início, sempre relativo a hoje, e só mexe nos pedidos marcados com o
 * prefixo DEMO_PREFIX em `clientRef`. Pedidos reais nunca são tocados. Só gera dias passados, então as senhas
 * do dia de hoje continuam começando em 1.
 */
export const DEMO_PREFIX = 'demo-'
const DAYS = 14
const TZ = 'America/Sao_Paulo'

/** Gerador pseudoaleatório com semente: o mesmo dia sempre gera os mesmos pedidos. */
function mulberry32(seed: number) {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const dateKey = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)

/** Pesos de venda por produto: hambúrgueres e combos puxam o faturamento. */
const WEIGHTS: Record<string, number> = {
  classic: 5, bacon: 4, chicken: 3, veggie: 1,
  'combo-classic': 4, 'combo-bacon': 3,
  fries: 3, onion: 1, nuggets: 2,
  cola: 4, juice: 1, shake: 2, sundae: 2, brownie: 1,
}

/** Horas de pico (almoço e jantar), em peso. */
const HOUR_WEIGHTS: [number, number][] = [
  [11, 2], [12, 8], [13, 7], [14, 3], [18, 3], [19, 8], [20, 8], [21, 5], [22, 2],
]

function pickWeighted<T>(rand: () => number, items: [T, number][]): T {
  const total = items.reduce((s, [, w]) => s + w, 0)
  let r = rand() * total
  for (const [item, w] of items) {
    r -= w
    if (r <= 0) return item
  }
  return items[items.length - 1][0]
}

export async function seedDemoOrders(prisma: PrismaClient, now: Date = new Date()) {
  const products = await prisma.product.findMany({ where: { id: { in: Object.keys(WEIGHTS) } }, include: { extras: true } })
  if (products.length === 0) return 0
  const weighted = products.map((p) => [p, WEIGHTS[p.id] ?? 1] as [(typeof products)[number], number])

  await prisma.order.deleteMany({ where: { clientRef: { startsWith: DEMO_PREFIX } } })

  // Tudo em lote (poucas consultas): com o banco remoto, criar pedido a pedido atrasaria a inicialização.
  const orders: Prisma.OrderCreateManyInput[] = []
  const items: Prisma.OrderItemCreateManyInput[] = []
  const payments: Prisma.PaymentCreateManyInput[] = []
  const events: Prisma.OrderEventCreateManyInput[] = []
  const counters: { date: string; last: number }[] = []
  for (let back = DAYS; back >= 1; back--) {
    const day = new Date(now.getTime() - back * 86_400_000)
    const key = dateKey(day)
    const rand = mulberry32(Number(key.replace(/-/g, '')))
    const weekend = [0, 6].includes(new Date(`${key}T12:00:00-03:00`).getUTCDay())
    const count = Math.round((weekend ? 38 : 24) + rand() * 12)
    const times = Array.from({ length: count }, () => {
      const hour = pickWeighted(rand, HOUR_WEIGHTS)
      return new Date(`${key}T${String(hour).padStart(2, '0')}:${String(Math.floor(rand() * 60)).padStart(2, '0')}:${String(Math.floor(rand() * 60)).padStart(2, '0')}-03:00`)
    }).sort((a, b) => a.getTime() - b.getTime())

    let ticket = 0
    for (const at of times) {
      const lines = Array.from({ length: 1 + Math.floor(rand() * 3) }, () => {
        const p = pickWeighted(rand, weighted)
        const extras = p.extras.length > 0 && rand() < 0.3 ? [p.extras[Math.floor(rand() * p.extras.length)]] : []
        return {
          productId: p.id,
          productName: p.name,
          qty: rand() < 0.2 ? 2 : 1,
          unitPriceCents: p.priceCents + extras.reduce((s, e) => s + e.priceCents, 0),
          extras: extras.map((e) => ({ id: e.id, name: e.name, priceCents: e.priceCents })),
          removed: [] as string[],
        }
      })
      const subtotal = lines.reduce((s, l) => s + l.unitPriceCents * l.qty, 0)
      const coupon = rand() < 0.1
      const discountCents = coupon ? Math.round(subtotal * 0.1) : 0
      const totalCents = subtotal - discountCents
      const method = pickWeighted(rand, [['PIX', 5], ['CARD', 4], ['CASH', 1]] as ['PIX' | 'CARD' | 'CASH', number][])
      const canceled = rand() < 0.04
      const readyAt = new Date(at.getTime() + (8 + Math.floor(rand() * 10)) * 60_000)
      ticket += 1
      const id = randomUUID()
      orders.push({
        id,
        ticket,
        mode: rand() < 0.65 ? 'DINE_IN' : 'TAKEAWAY',
        totalCents,
        discountCents,
        couponCode: coupon ? 'BEMVINDO10' : null,
        clientRef: `${DEMO_PREFIX}${key}-${ticket}`,
        status: canceled ? 'CANCELED' : 'DELIVERED',
        createdAt: at,
        updatedAt: readyAt,
      })
      for (const l of lines) items.push({ id: randomUUID(), orderId: id, ...l })
      payments.push({
        orderId: id,
        method,
        amountCents: totalCents,
        status: canceled ? 'EXPIRED' : 'PAID',
        paidAt: canceled ? null : at,
        createdAt: at,
      })
      const step = (from: Prisma.OrderEventCreateManyInput['from'], to: NonNullable<Prisma.OrderEventCreateManyInput['to']>, createdAt: Date) =>
        events.push({ orderId: id, from, to, createdAt })
      step(null, 'CREATED', at)
      if (canceled) step('CREATED', 'CANCELED', readyAt)
      else {
        step('CREATED', 'PAID', at)
        step('PAID', 'PREPARING', new Date(at.getTime() + 60_000))
        step('PREPARING', 'READY', readyAt)
        step('READY', 'DELIVERED', new Date(readyAt.getTime() + 2 * 60_000))
      }
    }
    counters.push({ date: key, last: ticket })
  }

  await prisma.$transaction(async (tx) => {
    await tx.order.createMany({ data: orders })
    await tx.orderItem.createMany({ data: items })
    await tx.payment.createMany({ data: payments })
    await tx.orderEvent.createMany({ data: events })
    for (const c of counters) await tx.dailyCounter.upsert({ where: { date: c.date }, update: { last: c.last }, create: c })
  }, { timeout: 60_000 })
  return orders.length
}
