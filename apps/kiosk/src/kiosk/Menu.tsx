import { useState } from 'react'
import { brl, lineTotal } from '../lib/format'
import { pick, useI18n } from '../lib/i18n'
import type { CartItem, Category, Product } from '../lib/types'

interface Props {
  categories: Category[]
  products: Product[]
  cart: CartItem[]
  onAdd: (p: Product) => void
  onQty: (uid: string, delta: number) => void
  onCancel: () => void
  onCheckout: () => void
}

export default function Menu({ categories, products, cart, onAdd, onQty, onCancel, onCheckout }: Props) {
  const { t, lang } = useI18n()
  const [cat, setCat] = useState(categories[0]?.id ?? '')
  const total = cart.reduce((s, i) => s + lineTotal(i), 0)
  const count = cart.reduce((s, i) => s + i.qty, 0)

  return (
    <div className="menu-layout">
      {/* Anuncia mudanças no pedido para leitores de tela (quem enxerga vê o carrinho ao lado). */}
      <div className="sr-only" role="status" aria-live="polite">
        {count === 0 ? t('menu.live.empty') : count === 1 ? t('menu.live.one', { total: brl(total) }) : t('menu.live.many', { n: count, total: brl(total) })}
      </div>
      <nav className="cats" aria-label={t('menu.categories')}>
        {categories.map((c) => (
          <button key={c.id} className={c.id === cat ? 'cat active' : 'cat'} onClick={() => setCat(c.id)}>
            <span className="cat-emoji">{c.emoji}</span>
            {pick(lang, c.label, c.labelEn)}
          </button>
        ))}
      </nav>

      <section className="products">
        {products
          .filter((p) => p.category === cat)
          .map((p) => (
            <button key={p.id} className="product" disabled={!p.available} onClick={() => onAdd(p)}>
              <span className="product-emoji">{p.emoji}</span>
              <strong>{pick(lang, p.name, p.nameEn)}</strong>
              <small>{pick(lang, p.description, p.descriptionEn)}</small>
              <span className="price">{p.available ? brl(p.priceCents) : t('menu.soldOut')}</span>
            </button>
          ))}
      </section>

      <aside className="cart" aria-label={t('menu.yourOrder')}>
        <h2>{t('menu.yourOrder')}</h2>
        <div className="cart-items">
          {cart.length === 0 && <p className="muted">{t('menu.empty')}</p>}
          {cart.map((i) => (
            <div key={i.uid} className="cart-item">
              <div>
                <strong>{pick(lang, i.product.name, i.product.nameEn)}</strong>
                {i.extras.map((e) => (
                  <small key={e.id}>+ {pick(lang, e.name, e.nameEn)}</small>
                ))}
                {i.removed.map((r) => (
                  <small key={r}>{t('menu.without', { x: r })}</small>
                ))}
              </div>
              <div className="cart-item-right">
                <span>{brl(lineTotal(i))}</span>
                <div className="stepper">
                  <button aria-label={t('menu.decrease')} onClick={() => onQty(i.uid, -1)}>−</button>
                  <span>{i.qty}</span>
                  <button aria-label={t('menu.increase')} onClick={() => onQty(i.uid, 1)}>+</button>
                </div>
              </div>
            </div>
          ))}
        </div>
        <div className="cart-footer">
          <div className="total-row">
            <span>{t('menu.total', { n: count })}</span>
            <strong>{brl(total)}</strong>
          </div>
          <button className="btn-primary" disabled={!count} onClick={onCheckout}>
            {t('menu.checkout')}
          </button>
          <button className="btn-ghost" onClick={onCancel}>{t('menu.cancel')}</button>
        </div>
      </aside>
    </div>
  )
}
