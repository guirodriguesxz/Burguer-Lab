import { useState } from 'react'
import { brl } from '../lib/format'
import type { CartItem, Extra, Product } from '../lib/types'

interface Props {
  product: Product
  onClose: () => void
  onConfirm: (item: CartItem) => void
}

function toggle(list: string[], v: string) {
  return list.includes(v) ? list.filter((x) => x !== v) : [...list, v]
}

export default function Customize({ product, onClose, onConfirm }: Props) {
  const [extras, setExtras] = useState<Extra[]>([])
  const [removed, setRemoved] = useState<string[]>([])
  const [qty, setQty] = useState(1)

  const unit = product.priceCents + extras.reduce((s, e) => s + e.priceCents, 0)

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label={`Personalizar ${product.name}`}>
      <div className="modal">
        <header>
          <span className="product-emoji">{product.emoji}</span>
          <div>
            <h2>{product.name}</h2>
            <p className="muted">{product.description}</p>
          </div>
        </header>

        {product.removable.length > 0 && (
          <>
            <h3>Remover ingredientes</h3>
            <div className="chips">
              {product.removable.map((r) => (
                <button key={r} className={removed.includes(r) ? 'chip on' : 'chip'} onClick={() => setRemoved(toggle(removed, r))}>
                  Sem {r}
                </button>
              ))}
            </div>
          </>
        )}

        {product.extras.length > 0 && (
          <>
            <h3>Adicionais</h3>
            <div className="chips">
              {product.extras.map((e) => {
                const on = extras.some((x) => x.id === e.id)
                return (
                  <button
                    key={e.id}
                    className={on ? 'chip on' : 'chip'}
                    onClick={() => setExtras(on ? extras.filter((x) => x.id !== e.id) : [...extras, e])}
                  >
                    {e.name} <small>+{brl(e.priceCents)}</small>
                  </button>
                )
              })}
            </div>
          </>
        )}

        <footer>
          <div className="stepper big">
            <button aria-label="Diminuir" onClick={() => setQty(Math.max(1, qty - 1))}>−</button>
            <span>{qty}</span>
            <button aria-label="Aumentar" onClick={() => setQty(qty + 1)}>+</button>
          </div>
          <button className="btn-ghost" onClick={onClose}>Voltar</button>
          <button
            className="btn-primary"
            onClick={() => onConfirm({ uid: crypto.randomUUID(), product, qty, extras, removed })}
          >
            Adicionar · {brl(unit * qty)}
          </button>
        </footer>
      </div>
    </div>
  )
}
