import { useState } from 'react'
import { brl } from '../lib/format'
import type { UpsellSuggestion } from '../lib/types'

interface Props {
  suggestions: UpsellSuggestion[]
  onAdd: (productId: string) => void
  onContinue: () => void
}

export default function Upsell({ suggestions, onAdd, onContinue }: Props) {
  const [added, setAdded] = useState<string[]>([])

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label="Sugestões para seu pedido">
      <div className="modal">
        <h2>Que tal completar seu pedido?</h2>
        <div className="upsell-list">
          {suggestions.map(({ reason, product }) => {
            const done = added.includes(product.id)
            return (
              <div key={product.id} className="upsell-item">
                <span className="product-emoji">{product.emoji}</span>
                <div>
                  <small className="muted">{reason}</small>
                  <strong>{product.name}</strong>
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
                  {done ? 'Adicionado ✓' : 'Adicionar'}
                </button>
              </div>
            )
          })}
        </div>
        <footer>
          <button className="btn-primary" onClick={onContinue}>
            {added.length > 0 ? 'Continuar para o pagamento' : 'Não, obrigado'}
          </button>
        </footer>
      </div>
    </div>
  )
}
