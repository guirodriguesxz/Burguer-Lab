import { useCallback, useEffect, useState } from 'react'
import { fetchAudit, type AuditFilters, type AuditPage } from '../lib/api'

const LABEL: Record<string, string> = {
  'auth.login': 'Entrou',
  'auth.login_failed': 'Tentativa de login falhou',
  'auth.logout': 'Saiu',
  'auth.password_changed': 'Trocou a própria senha',
  'auth.password_reset': 'Redefiniu a senha pelo link',
  'user.create': 'Criou usuário',
  'user.update': 'Alterou usuário',
  'user.send_reset': 'Enviou link de senha',
  'product.create': 'Criou produto',
  'product.update': 'Alterou produto',
  'product.archive': 'Excluiu produto',
  'product.restore': 'Restaurou produto',
  'extra.create': 'Criou adicional',
  'extra.update': 'Alterou adicional',
  'extra.delete': 'Excluiu adicional',
  'category.create': 'Criou categoria',
  'category.update': 'Alterou categoria',
  'category.delete': 'Excluiu categoria',
  'coupon.create': 'Criou cupom',
  'coupon.update': 'Alterou cupom',
  'payment.refund': 'Estornou pagamento',
  'payment.cash_confirmed': 'Confirmou pagamento no caixa',
  'order.cancel': 'Cancelou pedido',
  'export.orders_csv': 'Exportou pedidos (CSV)',
}

const GROUPS = [
  ['', 'Todas as ações'],
  ['auth.', 'Acesso e senha'],
  ['user.', 'Usuários'],
  ['product.', 'Produtos'],
  ['extra.', 'Adicionais'],
  ['category.', 'Categorias'],
  ['coupon.', 'Cupons'],
  ['payment.', 'Pagamentos'],
  ['order.', 'Pedidos'],
  ['export.', 'Exportações'],
]

const show = (v: unknown) => (v === null || v === undefined ? '—' : typeof v === 'object' ? JSON.stringify(v) : String(v))

/** Resume o que mudou: "priceCents: 2490 → 2990". */
function details(meta: unknown): string {
  if (!meta || typeof meta !== 'object') return ''
  const m = meta as Record<string, unknown>
  const parts: string[] = []
  for (const [k, v] of Object.entries(m)) {
    if (k === 'changes' && v && typeof v === 'object') {
      for (const [field, c] of Object.entries(v as Record<string, { de: unknown; para: unknown }>)) parts.push(`${field}: ${show(c.de)} → ${show(c.para)}`)
    } else {
      parts.push(`${k}: ${show(v)}`)
    }
  }
  return parts.join(' · ')
}

export default function AuditLog() {
  const [filters, setFilters] = useState<AuditFilters>({})
  const [applied, setApplied] = useState<AuditFilters>({})
  const [page, setPage] = useState(1)
  const [data, setData] = useState<AuditPage | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => {
    fetchAudit({ ...applied, page })
      .then((d) => (setData(d), setError(null)))
      .catch((e) => setError(e instanceof Error ? e.message : 'Erro ao carregar'))
  }, [applied, page])

  useEffect(load, [load])

  const set = (k: keyof AuditFilters) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setFilters({ ...filters, [k]: e.target.value })
  const search = (e: React.FormEvent) => {
    e.preventDefault()
    setPage(1)
    setApplied(filters)
  }
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1

  return (
    <>
      <div className="toolbar">
        <h1>Auditoria</h1>
        <span className="muted">Quem fez o quê. Senhas e dados de clientes nunca são registrados.</span>
      </div>

      <form className="panel filters" onSubmit={search}>
        <div className="field">
          <label htmlFor="a-from">De</label>
          <input id="a-from" type="date" value={filters.from ?? ''} onChange={set('from')} />
        </div>
        <div className="field">
          <label htmlFor="a-to">Até</label>
          <input id="a-to" type="date" value={filters.to ?? ''} onChange={set('to')} />
        </div>
        <div className="field">
          <label htmlFor="a-action">Tipo</label>
          <select id="a-action" value={filters.action ?? ''} onChange={set('action')}>
            {GROUPS.map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
        </div>
        <div className="field grow">
          <label htmlFor="a-actor">Quem (e-mail)</label>
          <input id="a-actor" value={filters.actor ?? ''} onChange={set('actor')} />
        </div>
        <button className="primary">Filtrar</button>
      </form>

      {error && <p role="alert" className="error">{error}</p>}
      {!data ? (
        <p className="muted">Carregando…</p>
      ) : data.items.length === 0 ? (
        <p className="muted">Nenhum registro.</p>
      ) : (
        <>
          <p className="muted">{data.total} registro(s)</p>
          <table>
            <thead>
              <tr>
                <th>Quando</th>
                <th>Quem</th>
                <th>Ação</th>
                <th>Detalhes</th>
                <th>IP</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((r) => (
                <tr key={r.id}>
                  <td>{new Date(r.at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'medium' })}</td>
                  <td>{r.actorEmail ?? '—'}</td>
                  <td>
                    <strong>{LABEL[r.action] ?? r.action}</strong>
                    {r.entityId && <small className="muted"> · {r.entity} {r.entityId.slice(0, 8)}</small>}
                  </td>
                  <td className="audit-details">{details(r.meta)}</td>
                  <td className="muted">{r.ip ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="pager">
            <button className="ghost" disabled={page <= 1} onClick={() => setPage(page - 1)}>← Anterior</button>
            <span>Página {page} de {pages}</span>
            <button className="ghost" disabled={page >= pages} onClick={() => setPage(page + 1)}>Próxima →</button>
          </div>
        </>
      )}
    </>
  )
}
