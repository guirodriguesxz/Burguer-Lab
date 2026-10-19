import { useEffect, useState } from 'react'
import { brl, createCoupon, fetchCoupons, patchCoupon, type Coupon } from '../lib/api'

const describe = (c: Coupon) => (c.type === 'PERCENT' ? `${c.value}% de desconto` : `${brl(c.value)} de desconto`)

export default function Coupons() {
  const [coupons, setCoupons] = useState<Coupon[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const [code, setCode] = useState('')
  const [type, setType] = useState<'PERCENT' | 'FIXED'>('PERCENT')
  const [value, setValue] = useState('10')
  const [min, setMin] = useState('')
  const [max, setMax] = useState('')
  const [expires, setExpires] = useState('')

  useEffect(() => {
    fetchCoupons()
      .then(setCoupons)
      .catch((e) => setError(e instanceof Error ? e.message : 'Erro ao carregar'))
  }, [])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    const num = parseFloat(value.replace(',', '.'))
    try {
      const created = await createCoupon({
        code,
        type,
        // percentual em pontos inteiros; valor fixo digitado em reais vira centavos
        value: type === 'PERCENT' ? Math.round(num) : Math.round(num * 100),
        minOrderCents: min ? Math.round(parseFloat(min.replace(',', '.')) * 100) : 0,
        maxUses: max ? parseInt(max, 10) : null,
        expiresAt: expires ? new Date(`${expires}T23:59:59`).toISOString() : null,
      })
      setCoupons((prev) => [created, ...(prev ?? [])])
      setCode('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao criar cupom')
    }
  }

  const toggle = async (c: Coupon) => {
    try {
      const updated = await patchCoupon(c.id, { active: !c.active })
      setCoupons((prev) => prev?.map((x) => (x.id === c.id ? updated : x)) ?? null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao atualizar')
    }
  }

  return (
    <>
      <div className="toolbar">
        <h1>Cupons</h1>
      </div>

      <form className="panel coupon-form" onSubmit={submit}>
        <label>
          Código
          <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} minLength={3} required />
        </label>
        <label>
          Tipo
          <select value={type} onChange={(e) => setType(e.target.value as 'PERCENT' | 'FIXED')}>
            <option value="PERCENT">Percentual (%)</option>
            <option value="FIXED">Valor fixo (R$)</option>
          </select>
        </label>
        <label>
          Valor
          <input inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} required />
        </label>
        <label>
          Pedido mínimo (R$)
          <input inputMode="decimal" value={min} onChange={(e) => setMin(e.target.value)} placeholder="opcional" />
        </label>
        <label>
          Limite de usos
          <input inputMode="numeric" value={max} onChange={(e) => setMax(e.target.value)} placeholder="ilimitado" />
        </label>
        <label>
          Validade
          <input type="date" value={expires} onChange={(e) => setExpires(e.target.value)} />
        </label>
        <button className="primary">Criar cupom</button>
      </form>

      {error && <p role="alert" className="error">{error}</p>}
      {!coupons ? (
        <p className="muted">Carregando…</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Código</th>
              <th>Desconto</th>
              <th>Mínimo</th>
              <th>Usos</th>
              <th>Validade</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {coupons.map((c) => (
              <tr key={c.id} className={c.active ? '' : 'off'}>
                <td><strong>{c.code}</strong></td>
                <td>{describe(c)}</td>
                <td>{c.minOrderCents ? brl(c.minOrderCents) : '—'}</td>
                <td>{c.usedCount}{c.maxUses ? ` / ${c.maxUses}` : ''}</td>
                <td>{c.expiresAt ? new Date(c.expiresAt).toLocaleDateString('pt-BR') : '—'}</td>
                <td>
                  <label className="switch">
                    <input type="checkbox" checked={c.active} onChange={() => toggle(c)} />
                    {c.active ? 'Ativo' : 'Inativo'}
                  </label>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  )
}
