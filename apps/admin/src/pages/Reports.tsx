import { useEffect, useState } from 'react'
import { brl, fetchSummary, type Summary } from '../lib/api'

function Bars({ data, label, format }: { data: { key: string; value: number }[]; label: string; format: (v: number) => string }) {
  const max = Math.max(1, ...data.map((d) => d.value))
  return (
    <div className="bars" role="img" aria-label={label}>
      {data.map((d) => (
        <div key={d.key} className="bar-col" title={`${d.key}: ${format(d.value)}`}>
          <div className="bar" style={{ height: `${(d.value / max) * 100}%` }} />
          <span>{d.key}</span>
        </div>
      ))}
    </div>
  )
}

export default function Reports() {
  const [days, setDays] = useState(7)
  const [data, setData] = useState<Summary | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetchSummary(days)
      .then((d) => !cancelled && (setData(d), setError(null)))
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : 'Erro ao carregar'))
    return () => {
      cancelled = true
    }
  }, [days])

  const hours = data?.byHour.filter((h) => h.hour >= 8 && h.hour <= 23) ?? []

  return (
    <>
      <div className="toolbar">
        <h1>Relatórios</h1>
        <div className="seg" role="group" aria-label="Período">
          {[1, 7, 30].map((d) => (
            <button key={d} className={d === days ? 'on' : ''} onClick={() => setDays(d)}>
              {d === 1 ? '24h' : `${d} dias`}
            </button>
          ))}
        </div>
      </div>
      {error && <p role="alert" className="error">{error}</p>}
      {!data ? (
        <p className="muted">Carregando…</p>
      ) : (
        <>
          <div className="stats">
            <div className="stat"><small>Faturamento</small><strong>{brl(data.revenueCents)}</strong></div>
            <div className="stat"><small>Pedidos</small><strong>{data.orders}</strong></div>
            <div className="stat"><small>Ticket médio</small><strong>{brl(data.avgTicketCents)}</strong></div>
          </div>

          <div className="panels">
            <section className="panel">
              <h2>Pedidos por hora</h2>
              <Bars label="Pedidos por hora do dia" data={hours.map((h) => ({ key: String(h.hour), value: h.orders }))} format={(v) => `${v} pedidos`} />
            </section>
            <section className="panel">
              <h2>Mais vendidos</h2>
              {data.topProducts.length === 0 && <p className="muted">Sem vendas no período.</p>}
              <ol className="top">
                {data.topProducts.map((p) => (
                  <li key={p.name}>
                    <span>{p.name}</span>
                    <strong>{p.qty} un · {brl(p.revenueCents)}</strong>
                  </li>
                ))}
              </ol>
            </section>
          </div>

          {data.byDay.length > 0 && (
            <section className="panel">
              <h2>Faturamento por dia</h2>
              <Bars label="Faturamento por dia" data={data.byDay.map((d) => ({ key: d.day.slice(5), value: d.revenueCents }))} format={brl} />
            </section>
          )}
        </>
      )}
    </>
  )
}
