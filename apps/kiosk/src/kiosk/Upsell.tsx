import { useState } from 'react'
import { brl } from '../lib/format'
import { pick, useI18n, type MessageKey } from '../lib/i18n'
import { useDialog } from '../lib/useDialog'
import type { UpsellSuggestion } from '../lib/types'

interface Props {
  suggestions: UpsellSuggestion[]
  onAdd: (productId: string) => void
  onContinue: () => void
}

const REASON: Record<string, MessageKey> = { drinks: 'upsell.drinks', sides: 'upsell.sides', desserts: 'upsell.desserts' }

export default function Upsell({ suggestions, onAdd, onContinue }: Props) {
  const { t, lang } = useI18n()
  const [added, setAdded] = useState<string[]>([])
  const ref = useDialog<HTMLDivElement>(onContinue) // Esc = "Não, obrigado"

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label={t('upsell.aria')}>
      <div className="modal" ref={ref} tabIndex={-1}>
        <h2>{t('upsell.title')}</h2>
        <div className="upsell-list">
          {suggestions.map(({ kind, reason, product }) => {
            const done = added.includes(product.id)
            return (
              <div key={product.id} className="upsell-item">
                <span className="product-emoji">{product.emoji}</span>
                <div>
                  <small className="muted">{REASON[kind] ? t(REASON[kind]) : reason}</small>
                  <strong>{pick(lang, product.name, product.nameEn)}</strong>
                  <span className="price">{brl(product.priceCents)}</span>
                </div>
                <button
                  className={done ? 'btn-ghost' : 'btn-primary'}
                  disabled={done}
                  onClick={() => {
                    setAdded([...added, product.id])
                    onAdd(product.id)
                  }}
                >
                  {done ? t('upsell.added') : t('upsell.add')}
                </button>
              </div>
            )
          })}
        </div>
        <footer>
          <button className="btn-primary" onClick={onContinue}>
            {added.length > 0 ? t('upsell.continue') : t('upsell.no')}
          </button>
        </footer>
      </div>
    </div>
  )
}
