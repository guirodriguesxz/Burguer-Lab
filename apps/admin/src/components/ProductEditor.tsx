import { useEffect, useState } from 'react'
import {
  archiveProduct,
  brl,
  createCategory,
  createExtra,
  createProduct,
  deleteExtra,
  fetchCategories,
  parseMoney,
  patchExtra,
  patchProduct,
  type AdminCategory,
  type AdminExtra,
  type AdminProduct,
} from '../lib/api'
import { useDialog } from '../lib/useDialog'

interface Props {
  /** null = novo produto */
  product: AdminProduct | null
  onClose: () => void
  /** Chamado a cada gravação, para a lista de trás refletir a mudança. */
  onSaved: (p: AdminProduct) => void
  onArchived: (id: string) => void
}

const message = (e: unknown) => (e instanceof Error ? e.message : 'Algo deu errado')

export default function ProductEditor({ product, onClose, onSaved, onArchived }: Props) {
  const [categories, setCategories] = useState<AdminCategory[]>([])
  const [name, setName] = useState(product?.name ?? '')
  const [nameEn, setNameEn] = useState(product?.nameEn ?? '')
  const [descriptionEn, setDescriptionEn] = useState(product?.descriptionEn ?? '')
  const [emoji, setEmoji] = useState(product?.emoji ?? '🍔')
  const [description, setDescription] = useState(product?.description ?? '')
  const [categoryId, setCategoryId] = useState(product?.categoryId ?? '')
  const [price, setPrice] = useState(product ? (product.priceCents / 100).toFixed(2) : '')
  const [stock, setStock] = useState(product?.stock == null ? '' : String(product.stock))
  const [removable, setRemovable] = useState<string[]>(product?.removable ?? [])
  const [chip, setChip] = useState('')
  const [available, setAvailable] = useState(product?.available ?? true)
  const [extras, setExtras] = useState<AdminExtra[]>(product?.extras ?? [])
  const [newExtra, setNewExtra] = useState({ name: '', price: '' })
  const [newCat, setNewCat] = useState<{ label: string; emoji: string } | null>(null)
  const [saved, setSaved] = useState<AdminProduct | null>(product)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const ref = useDialog<HTMLDivElement>(onClose)

  useEffect(() => {
    fetchCategories()
      .then((list) => {
        setCategories(list)
        setCategoryId((c) => c || list[0]?.id || '')
      })
      .catch((e) => setError(message(e)))
  }, [])

  const run = async (fn: () => Promise<void>) => {
    setBusy(true)
    setError(null)
    try {
      await fn()
    } catch (e) {
      setError(message(e))
    } finally {
      setBusy(false)
    }
  }

  const addChip = () => {
    const v = chip.trim()
    if (v && !removable.includes(v)) setRemovable([...removable, v])
    setChip('')
  }

  const save = (e: React.FormEvent) => {
    e.preventDefault()
    return run(async () => {
      const priceCents = parseMoney(price)
      const data = {
        name,
        emoji,
        description,
        nameEn,
        descriptionEn,
        categoryId,
        priceCents,
        stock: stock.trim() === '' ? null : parseInt(stock, 10),
        removable,
        available,
      }
      const result = saved ? await patchProduct(saved.id, data) : await createProduct(data)
      setSaved(result)
      onSaved(result)
      if (!product) setError(null) // produto novo: segue aberto para cadastrar os adicionais
    })
  }

  const addExtra = () =>
    run(async () => {
      if (!saved) throw new Error('Salve o produto antes de adicionar adicionais')
      const created = await createExtra(saved.id, { name: newExtra.name, priceCents: Math.max(0, parseMoney(newExtra.price || '0')) })
      const next = [...extras, created]
      setExtras(next)
      setNewExtra({ name: '', price: '' })
      onSaved({ ...saved, extras: next })
    })

  const updateExtraPrice = (extra: AdminExtra, value: string) =>
    run(async () => {
      const priceCents = parseMoney(value)
      if (!(priceCents >= 0)) throw new Error('Preço inválido')
      const updated = await patchExtra(extra.id, { priceCents })
      setExtras(extras.map((x) => (x.id === extra.id ? updated : x)))
    })

  const removeExtra = (extra: AdminExtra) =>
    run(async () => {
      await deleteExtra(extra.id)
      const next = extras.filter((x) => x.id !== extra.id)
      setExtras(next)
      if (saved) onSaved({ ...saved, extras: next })
    })

  const addCategory = () =>
    run(async () => {
      if (!newCat) return
      const created = await createCategory(newCat)
      setCategories([...categories, created])
      setCategoryId(created.id)
      setNewCat(null)
    })

  const archive = () =>
    run(async () => {
      if (!saved || !window.confirm(`Excluir "${saved.name}"? Ele sai do cardápio, mas os pedidos antigos continuam no histórico.`)) return
      await archiveProduct(saved.id)
      onArchived(saved.id)
      onClose()
    })

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label={product ? `Editar ${product.name}` : 'Novo produto'}>
      <div className="dialog editor" ref={ref} tabIndex={-1}>
        <h2>{product ? 'Editar produto' : saved ? 'Produto criado' : 'Novo produto'}</h2>

        <form onSubmit={save} className="editor-form">
          <div className="field">
            <label htmlFor="p-name">Nome</label>
            <input id="p-name" value={name} onChange={(e) => setName(e.target.value)} minLength={2} maxLength={60} required />
          </div>
          <div className="field small">
            <label htmlFor="p-emoji">Emoji</label>
            <input id="p-emoji" value={emoji} onChange={(e) => setEmoji(e.target.value)} maxLength={8} required />
          </div>
          <div className="field wide">
            <label htmlFor="p-desc">Descrição</label>
            <input id="p-desc" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={200} />
          </div>

          <div className="field">
            <label htmlFor="p-name-en">Nome em inglês (opcional)</label>
            <input id="p-name-en" value={nameEn} onChange={(e) => setNameEn(e.target.value)} maxLength={60} />
          </div>
          <div className="field wide">
            <label htmlFor="p-desc-en">Descrição em inglês (opcional)</label>
            <input id="p-desc-en" value={descriptionEn} onChange={(e) => setDescriptionEn(e.target.value)} maxLength={200} />
          </div>

          <div className="field">
            <label htmlFor="p-cat">Categoria</label>
            <select id="p-cat" value={categoryId} onChange={(e) => setCategoryId(e.target.value)} required>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.emoji} {c.label}</option>
              ))}
            </select>
            {newCat ? (
              <span className="inline-new">
                <input aria-label="Emoji da nova categoria" value={newCat.emoji} onChange={(e) => setNewCat({ ...newCat, emoji: e.target.value })} maxLength={8} />
                <input aria-label="Nome da nova categoria" placeholder="Nome" value={newCat.label} onChange={(e) => setNewCat({ ...newCat, label: e.target.value })} />
                <button type="button" className="ghost" onClick={addCategory} disabled={busy || newCat.label.trim().length < 2}>Criar</button>
              </span>
            ) : (
              <button type="button" className="link" onClick={() => setNewCat({ label: '', emoji: '🍽️' })}>+ nova categoria</button>
            )}
          </div>
          <div className="field">
            <label htmlFor="p-price">Preço (R$)</label>
            <input id="p-price" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} required />
          </div>
          <div className="field">
            <label htmlFor="p-stock">Estoque</label>
            <input id="p-stock" inputMode="numeric" placeholder="ilimitado" value={stock} onChange={(e) => setStock(e.target.value)} />
          </div>

          <div className="field wide">
            <label htmlFor="p-chip">Ingredientes que o cliente pode tirar</label>
            <div className="chips">
              {removable.map((r) => (
                <span key={r} className="chip-item">
                  {r}
                  <button type="button" aria-label={`Remover ingrediente ${r}`} onClick={() => setRemovable(removable.filter((x) => x !== r))}>×</button>
                </span>
              ))}
              <input
                id="p-chip"
                placeholder="digite e tecle Enter"
                value={chip}
                onChange={(e) => setChip(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    addChip()
                  }
                }}
                onBlur={addChip}
              />
            </div>
          </div>

          <label className="switch wide">
            <input type="checkbox" checked={available} onChange={(e) => setAvailable(e.target.checked)} />
            Disponível para venda
          </label>

          <div className="dialog-actions wide">
            <button type="button" className="ghost" onClick={onClose}>{saved ? 'Fechar' : 'Cancelar'}</button>
            <button className="primary" disabled={busy}>{busy ? 'Salvando…' : saved ? 'Salvar alterações' : 'Criar produto'}</button>
          </div>
        </form>

        {saved && (
          <section className="extras" aria-label="Adicionais">
            <h3>Adicionais</h3>
            {extras.length === 0 && <p className="muted">Nenhum adicional.</p>}
            <ul>
              {extras.map((x) => (
                <li key={x.id}>
                  <span>{x.name}</span>
                  <input
                    aria-label={`Preço de ${x.name}`}
                    inputMode="decimal"
                    defaultValue={(x.priceCents / 100).toFixed(2)}
                    onBlur={(e) => e.target.value !== (x.priceCents / 100).toFixed(2) && updateExtraPrice(x, e.target.value)}
                  />
                  <button type="button" className="ghost danger" aria-label={`Excluir adicional ${x.name}`} onClick={() => removeExtra(x)}>Excluir</button>
                </li>
              ))}
            </ul>
            <div className="extra-new">
              <input aria-label="Nome do novo adicional" placeholder="Nome (ex.: Bacon)" value={newExtra.name} onChange={(e) => setNewExtra({ ...newExtra, name: e.target.value })} />
              <input aria-label="Preço do novo adicional" placeholder="R$ 0,00" inputMode="decimal" value={newExtra.price} onChange={(e) => setNewExtra({ ...newExtra, price: e.target.value })} />
              <button type="button" className="ghost" onClick={addExtra} disabled={busy || newExtra.name.trim().length < 2}>Adicionar</button>
            </div>
            <p className="muted hint">O cliente vê {extras.length ? extras.map((x) => `${x.name} (+${brl(x.priceCents)})`).join(', ') : 'nenhum adicional'}.</p>
          </section>
        )}

        {error && <p role="alert" className="error">{error}</p>}

        {saved && (
          <button type="button" className="ghost danger archive" onClick={archive} disabled={busy}>
            Excluir produto
          </button>
        )}
      </div>
    </div>
  )
}
