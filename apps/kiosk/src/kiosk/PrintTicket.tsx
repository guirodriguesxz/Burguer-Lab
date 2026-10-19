import { brl } from '../lib/format'
import { useI18n } from '../lib/i18n'
import type { Ticket } from './Checkout'

/**
 * Comprovante para impressora térmica de 80 mm, no idioma escolhido pelo cliente. Fica escondido na tela
 * e só aparece ao imprimir (ver @media print em index.css).
 */
export default function PrintTicket({ ticket }: { ticket: Ticket }) {
  const { t, lang } = useI18n()
  const p = ticket.print
  return (
    <div className="print-ticket" aria-hidden="true">
      <h2>Burger Lab</h2>
      {p && <p>{new Date(p.at).toLocaleString(lang === 'en' ? 'en-GB' : 'pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</p>}
      <p className="pt-label">{ticket.offline ? t('done.code') : t('done.ticket')}</p>
      <p className="pt-number">{ticket.offline ? ticket.clientRef : ticket.number}</p>
      {p && (
        <>
          <p className="pt-mode">{p.mode === 'DINE_IN' ? t('print.dineIn') : t('print.takeaway')}</p>
          <hr />
          <ul>
            {p.lines.map((l, i) => (
              <li key={i}>
                {l.qty}x {l.name}
                {l.extras.map((e) => (
                  <small key={e}>+ {e}</small>
                ))}
                {l.removed.map((r) => (
                  <small key={r}>{t('menu.without', { x: r })}</small>
                ))}
              </li>
            ))}
          </ul>
          <hr />
          <p className="pt-total">{t('print.total', { amount: brl(p.totalCents), method: t(`print.method.${p.method}` as const) })}</p>
        </>
      )}
      {ticket.cash && <p className="pt-cash">{t('print.payAtCounter')}</p>}
      <p className="pt-foot">{t('print.thanks')}</p>
    </div>
  )
}
