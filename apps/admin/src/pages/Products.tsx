import { useEffect, useState } from 'react'
import ProductEditor from '../components/ProductEditor'
import { brl, fetchProducts, parseMoney, patchProduct, restoreProduct, type AdminProduct } from '../lib/api'

function Row({ p, token, onSaved, onEdit }: { p: AdminProduct; token: string; onSaved: (p: AdminProduct) => void; onEdit: () => void }) {
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

  const priceCents = parseMoney(price)
  const stockValue = stock.trim() === '' ? null : parseInt(stock, 10)
  const dirty = priceCents !== p.priceCents || stockValue !== p.stock
  const invalid = !(priceCents > 0) || (stockValue !== null && !(stockValue >= 0))

  return (
    <tr className={p.available ? '' : 'off'}>
      <td>
        {p.emoji} <strong>{p.name}</strong>
        {p.extras.length > 0 && <small className="muted"> · {p.extras.length} adicional(is)</small>}
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
      <td className="actions">
        <button className="primary small" disabled={!dirty || invalid} onClick={() => save({ priceCents, stock: stockValue })}>
          Salvar
        </button>
        <button className="ghost" aria-label={`Editar ${p.name}`} onClick={onEdit}>Editar</button>
      </td>
    </tr>
  )
}

export default function Products({ token }: { token: string }) {
  const [products, setProducts] = useState<AdminProduct[] | null>(null)
  const [showArchived, setShowArchived] = useState(false)
  const [editing, setEditing] = useState<AdminProduct | 'new' | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setProducts(null)
    fetchProducts(token, showArchived)
      .then(setProducts)
      .catch((e) => setError(e instanceof Error ? e.message : 'Erro ao carregar'))
  }, [token, showArchived])

  // atualiza (ou inclui) um produto na lista conforme o editor grava
  const upsert = (p: AdminProduct) =>
    setProducts((prev) => (prev ? (prev.some((x) => x.id === p.id) ? prev.map((x) => (x.id === p.id ? p : x)) : [...prev, p]) : prev))

  const restore = async (p: AdminProduct) => {
    setError(null)
    try {
      await restoreProduct(token, p.id)
      setProducts((prev) => prev?.filter((x) => x.id !== p.id) ?? null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao restaurar')
    }
  }

  if (error && !products) return <p role="alert" className="error">{error}</p>
  if (!products) return <p className="muted">Carregando…</p>

  return (
    <>
      <div className="toolbar">
        <h1>{showArchived ? 'Produtos excluídos' : 'Cardápio'}</h1>
        <span className="toolbar-actions">
          <button className="ghost" onClick={() => setShowArchived(!showArchived)}>
            {showArchived ? '← Voltar ao cardápio' : 'Ver excluídos'}
          </button>
          {!showArchived && (
            <button className="primary" onClick={() => setEditing('new')}>
              ＋ Novo produto
            </button>
          )}
        </span>
      </div>
      {error && <p role="alert" className="error">{error}</p>}

      {showArchived ? (
        products.length === 0 ? (
          <p className="muted">Nenhum produto excluído.</p>
        ) : (
          <table>
            <thead>
              <tr><th>Produto</th><th>Preço</th><th /></tr>
            </thead>
            <tbody>
              {products.map((p) => (
                <tr key={p.id} className="off">
                  <td>{p.emoji} <strong>{p.name}</strong></td>
                  <td>{brl(p.priceCents)}</td>
                  <td className="actions">
                    <button className="ghost" onClick={() => restore(p)}>Restaurar</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )
      ) : (
        <>
          <p className="muted">Mudanças aparecem no totem em tempo real</p>
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
                <Row key={`${p.id}:${p.priceCents}:${p.stock}:${p.name}`} p={p} token={token} onSaved={upsert} onEdit={() => setEditing(p)} />
              ))}
            </tbody>
          </table>
        </>
      )}

      {editing && (
        <ProductEditor
          token={token}
          product={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={upsert}
          onArchived={(id) => setProducts((prev) => prev?.filter((x) => x.id !== id) ?? null)}
        />
      )}
    </>
  )
}
