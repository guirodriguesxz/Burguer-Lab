import type { Mode } from '../lib/types'

export default function Welcome({ onStart }: { onStart: (m: Mode) => void }) {
  return (
    <main className="welcome">
      <div className="welcome-logo">🍔</div>
      <h1>Burger Lab</h1>
      <p className="welcome-sub">Faça seu pedido aqui, sem fila.</p>
      <p className="welcome-ask">Onde você vai comer?</p>
      <div className="welcome-actions">
        <button className="btn-xl" onClick={() => onStart('DINE_IN')}>
          <span>🍽️</span> Comer aqui
        </button>
        <button className="btn-xl alt" onClick={() => onStart('TAKEAWAY')}>
          <span>🛍️</span> Levar
        </button>
      </div>
      <a className="kitchen-link" href="#/cozinha">Painel da cozinha →</a>
    </main>
  )
}
