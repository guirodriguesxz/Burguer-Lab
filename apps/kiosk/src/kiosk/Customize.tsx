import { useState } from 'react'
import { brl } from '../lib/format'
import { pick, useI18n } from '../lib/i18n'
import { useDialog } from '../lib/useDialog'
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
  const { t, lang } = useI18n()
  const [extras, setExtras] = useState<Extra[]>([])
  const [removed, setRemoved] = useState<string[]>([])
  const [qty, setQty] = useState(1)

  const ref = useDialog<HTMLDivElement>(onClose)
  const unit = product.priceCents + extras.reduce((s, e) => s + e.priceCents, 0)

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label={t('custom.title', { name: pick(lang, product.name, product.nameEn) })}>
      <div className="modal" ref={ref} tabIndex={-1}>
        <header>
          <span className="product-emoji">{product.emoji}</span>
          <div>
            <h2>{pick(lang, product.name, product.nameEn)}</h2>
            <p className="muted">{pick(lang, product.description, product.descriptionEn)}</p>
          </div>
        </header>

        {product.removable.length > 0 && (
          <>
            <h3>{t('custom.remove')}</h3>
            <div className="chips">
              {product.removable.map((r) => (
                <button key={r} className={removed.includes(r) ? 'chip on' : 'chip'} onClick={() => setRemoved(toggle(removed, r))}>
                  {t('custom.without', { x: r })}
                </button>
              ))}
            </div>
          </>
        )}

        {product.extras.length > 0 && (
          <>
            <h3>{t('custom.extras')}</h3>
            <div className="chips">
              {product.extras.map((e) => {
                const on = extras.some((x) => x.id === e.id)
                return (
                  <button
                    key={e.id}
                    className={on ? 'chip on' : 'chip'}
                    onClick={() => setExtras(on ? extras.filter((x) => x.id !== e.id) : [...extras, e])}
                  >
                    {pick(lang, e.name, e.nameEn)} <small>+{brl(e.priceCents)}</small>
                  </button>
                )
              })}
            </div>
          </>
        )}

        <footer>
          <div className="stepper big">
            <button aria-label={t('menu.decrease')} onClick={() => setQty(Math.max(1, qty - 1))}>−</button>
            <span>{qty}</span>
            <button aria-label={t('menu.increase')} onClick={() => setQty(qty + 1)}>+</button>
          </div>
          <button className="btn-ghost" onClick={onClose}>{t('custom.back')}</button>
          <button
            className="btn-primary"
            onClick={() => onConfirm({ uid: crypto.randomUUID(), product, qty, extras, removed })}
          >
            {t('custom.add', { price: brl(unit * qty) })}
          </button>
        </footer>
      </div>
    </div>
  )
}
