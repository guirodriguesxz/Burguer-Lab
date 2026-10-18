import { useState } from 'react'
import { brl, lineTotal } from '../lib/format'
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
  const [cat, setCat] = useState(categories[0]?.id ?? '')
  const total = cart.reduce((s, i) => s + lineTotal(i), 0)
  const count = cart.reduce((s, i) => s + i.qty, 0)

  return (
    <div className="menu-layout">
      <nav className="cats" aria-label="Categorias">
        {categories.map((c) => (
          <button key={c.id} className={c.id === cat ? 'cat active' : 'cat'} onClick={() => setCat(c.id)}>
            <span className="cat-emoji">{c.emoji}</span>
            {c.label}
          </button>
        ))}
      </nav>

      <section className="products">
        {products
          .filter((p) => p.category === cat)
          .map((p) => (
            <button key={p.id} className="product" disabled={!p.available} onClick={() => onAdd(p)}>
              <span className="product-emoji">{p.emoji}</span>
              <strong>{p.name}</strong>
              <small>{p.description}</small>
              <span className="price">{p.available ? brl(p.priceCents) : 'Esgotado'}</span>
            </button>
          ))}
      </section>

      <aside className="cart" aria-label="Seu pedido">
        <h2>Seu pedido</h2>
        <div className="cart-items">
          {cart.length === 0 && <p className="muted">Toque em um item para adicionar.</p>}
          {cart.map((i) => (
            <div key={i.uid} className="cart-item">
              <div>
                <strong>{i.product.name}</strong>
                {i.extras.map((e) => (
                  <small key={e.id}>+ {e.name}</small>
                ))}
                {i.removed.map((r) => (
                  <small key={r}>sem {r}</small>
                ))}
              </div>
              <div className="cart-item-right">
                <span>{brl(lineTotal(i))}</span>
                <div className="stepper">
                  <button aria-label="Diminuir" onClick={() => onQty(i.uid, -1)}>−</button>
                  <span>{i.qty}</span>
                  <button aria-label="Aumentar" onClick={() => onQty(i.uid, 1)}>+</button>
                </div>
              </div>
            </div>
          ))}
        </div>
        <div className="cart-footer">
          <div className="total-row">
            <span>Total ({count})</span>
            <strong>{brl(total)}</strong>
          </div>
          <button className="btn-primary" disabled={!count} onClick={onCheckout}>
            Ir para pagamento
          </button>
          <button className="btn-ghost" onClick={onCancel}>Cancelar pedido</button>
        </div>
      </aside>
    </div>
  )
}
