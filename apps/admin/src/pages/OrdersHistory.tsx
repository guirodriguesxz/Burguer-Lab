import { Fragment, useCallback, useEffect, useState } from 'react'
import { brl, downloadHistoryCsv, fetchHistory, refundOrder, type HistoryFilters, type HistoryPage } from '../lib/api'

const STATUS: Record<string, string> = {
  CREATED: 'Aguardando pagamento',
  PAID: 'Pago',
  PREPARING: 'Preparando',
  READY: 'Pronto',
  DELIVERED: 'Entregue',
  CANCELED: 'Cancelado',
}
const METHOD: Record<string, string> = { PIX: 'Pix', CARD: 'Cartão', CASH: 'Dinheiro' }
const PAYMENT: Record<string, string> = {
  PENDING: 'Pendente',
  PAID: 'Pago',
  EXPIRED: 'Expirado',
  REFUNDED: 'Estornado',
  REFUND_FAILED: 'Estorno falhou',
}

export default function OrdersHistory({ token }: { token: string }) {
  const [filters, setFilters] = useState<HistoryFilters>({})
  const [applied, setApplied] = useState<HistoryFilters>({})
  const [page, setPage] = useState(1)
  const [data, setData] = useState<HistoryPage | null>(null)
  const [open, setOpen] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(() => {
    fetchHistory(token, { ...applied, page })
      .then((d) => (setData(d), setError(null)))
      .catch((e) => setError(e instanceof Error ? e.message : 'Erro ao carregar'))
  }, [token, applied, page])

  useEffect(load, [load])

  const set = (k: keyof HistoryFilters) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setFilters({ ...filters, [k]: e.target.value })

  const search = (e: React.FormEvent) => {
    e.preventDefault()
    setPage(1)
    setApplied(filters)
  }

  const refund = async (id: string, ticket: number) => {
    if (!window.confirm(`Estornar o pedido #${ticket}? O pagamento será devolvido e, se o pedido ainda não foi entregue, ele será cancelado.`)) return
    setBusy(id)
    setError(null)
    try {
      await refundOrder(token, id)
      load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao estornar')
    } finally {
      setBusy(null)
    }
  }

  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1

  return (
    <>
      <div className="toolbar">
        <h1>Pedidos</h1>
        <button className="ghost" onClick={() => downloadHistoryCsv(token, applied).catch((e) => setError(e.message))}>
          ⬇️ Exportar CSV
        </button>
      </div>

      <form className="panel filters" onSubmit={search}>
        <div className="field">
          <label htmlFor="f-from">De</label>
          <input id="f-from" type="date" value={filters.from ?? ''} onChange={set('from')} />
        </div>
        <div className="field">
          <label htmlFor="f-to">Até</label>
          <input id="f-to" type="date" value={filters.to ?? ''} onChange={set('to')} />
        </div>
        <div className="field">
          <label htmlFor="f-status">Status</label>
          <select id="f-status" value={filters.status ?? ''} onChange={set('status')}>
            <option value="">Todos</option>
            {Object.entries(STATUS).map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="f-method">Pagamento</label>
          <select id="f-method" value={filters.method ?? ''} onChange={set('method')}>
            <option value="">Todos</option>
            {Object.entries(METHOD).map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="f-refund">Estorno</label>
          <select id="f-refund" value={filters.refund ?? ''} onChange={set('refund')}>
            <option value="">Qualquer</option>
            <option value="REFUNDED">Estornados</option>
            <option value="REFUND_FAILED">Estorno falhou</option>
          </select>
        </div>
        <div className="field grow">
          <label htmlFor="f-q">Buscar</label>
          <input id="f-q" placeholder="senha, código, cupom ou produto" value={filters.q ?? ''} onChange={set('q')} />
        </div>
        <button className="primary">Filtrar</button>
      </form>

      {error && <p role="alert" className="error">{error}</p>}
      {!data ? (
        <p className="muted">Carregando…</p>
      ) : data.items.length === 0 ? (
        <p className="muted">Nenhum pedido encontrado.</p>
      ) : (
        <>
          <p className="muted">{data.total} pedido(s)</p>
          <table>
            <thead>
              <tr>
                <th>Senha</th>
                <th>Data/hora</th>
                <th>Status</th>
                <th>Pagamento</th>
                <th>Total</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {data.items.map((o) => {
                const canRefund = o.payment?.status === 'PAID' || o.payment?.status === 'REFUND_FAILED'
                return (
                  <Fragment key={o.id}>
                    <tr>
                      <td>
                        <strong>#{o.ticket}</strong>
                      </td>
                      <td>{new Date(o.createdAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</td>
                      <td>{STATUS[o.status]}</td>
                      <td>
                        {o.payment ? METHOD[o.payment.method] : '—'}{' '}
                        <span className={`tag ${o.payment?.status === 'REFUND_FAILED' ? 'bad' : ''}`}>{o.payment ? PAYMENT[o.payment.status] : ''}</span>
                      </td>
                      <td>{brl(o.totalCents)}</td>
                      <td className="actions">
                        <button className="ghost" aria-expanded={open === o.id} onClick={() => setOpen(open === o.id ? null : o.id)}>
                          {open === o.id ? 'Fechar' : 'Detalhes'}
                        </button>
                        {canRefund && (
                          <button className="ghost danger" disabled={busy === o.id} onClick={() => refund(o.id, o.ticket)}>
                            {o.payment?.status === 'REFUND_FAILED' ? 'Tentar estorno de novo' : 'Estornar'}
                          </button>
                        )}
                      </td>
                    </tr>
                    {open === o.id && (
                      <tr className="detail">
                        <td colSpan={6}>
                          <ul>
                            {o.items.map((i) => (
                              <li key={i.id}>
                                {i.qty}× {i.productName}
                                {i.extras.map((e) => ` + ${e.name}`).join('')}
                                {i.removed.map((r) => ` · sem ${r}`).join('')}
                              </li>
                            ))}
                          </ul>
                          <p className="muted">
                            Pedido interno nº {o.number}
                            {o.couponCode ? ` · cupom ${o.couponCode} (−${brl(o.discountCents)})` : ''}
                            {o.clientRef ? ` · código offline ${o.clientRef}` : ''}
                          </p>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
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
