import { useEffect, useState } from 'react'
import { brl, fetchProducts, patchProduct, type AdminProduct } from '../lib/api'

function Row({ p, token, onSaved }: { p: AdminProduct; token: string; onSaved: (p: AdminProduct) => void }) {
  const [price, setPrice] = useState((p.priceCents / 100).toFixed(2))
  const [stock, setStock] = useState(p.stock === null ? '' : String(p.stock))
  const [error, setError] = useState<string | null>(null)

  const save = async (data: Parameters<typeof patchProduct>[2]) => {
    setError(null)
    try {
      onSaved(await patchProduct(token, p.id, data))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao salvar')
    }
  }

  const priceCents = Math.round(parseFloat(price.replace(',', '.')) * 100)
  const stockValue = stock.trim() === '' ? null : parseInt(stock, 10)
  const dirty = priceCents !== p.priceCents || stockValue !== p.stock
  const invalid = !(priceCents > 0) || (stockValue !== null && !(stockValue >= 0))

  return (
    <tr className={p.available ? '' : 'off'}>
      <td>
        {p.emoji} <strong>{p.name}</strong>
        {error && <small className="error"> {error}</small>}
      </td>
      <td>
        <input aria-label={`Preço de ${p.name}`} inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} />
      </td>
      <td>
        <input aria-label={`Estoque de ${p.name}`} inputMode="numeric" placeholder="ilimitado" value={stock} onChange={(e) => setStock(e.target.value)} />
      </td>
      <td>
        <label className="switch">
          <input type="checkbox" checked={p.available} onChange={(e) => save({ available: e.target.checked })} />
          {p.available ? 'Ativo' : 'Pausado'}
        </label>
      </td>
      <td>
        <button className="primary small" disabled={!dirty || invalid} onClick={() => save({ priceCents, stock: stockValue })}>
          Salvar
        </button>
      </td>
    </tr>
  )
}

export default function Products({ token }: { token: string }) {
  const [products, setProducts] = useState<AdminProduct[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchProducts(token)
      .then(setProducts)
      .catch((e) => setError(e instanceof Error ? e.message : 'Erro ao carregar'))
  }, [token])

  if (error) return <p role="alert" className="error">{error}</p>
  if (!products) return <p className="muted">Carregando…</p>

  return (
    <>
      <div className="toolbar">
        <h1>Cardápio</h1>
        <span className="muted">Mudanças aparecem no totem em tempo real</span>
      </div>
      <table>
        <thead>
          <tr>
            <th>Produto</th>
            <th>Preço (R$)</th>
            <th>Estoque</th>
            <th>Status</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {products.map((p) => (
            <Row key={`${p.id}:${p.priceCents}:${p.stock}`} p={p} token={token} onSaved={(n) => setProducts(products.map((x) => (x.id === n.id ? n : x)))} />
          ))}
        </tbody>
      </table>
      <p className="muted">Preço atual do item mais caro: {brl(Math.max(...products.map((p) => p.priceCents)))}</p>
    </>
  )
}
