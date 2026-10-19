import { useEffect, useState } from 'react'
import { useI18n } from '../lib/i18n'
import type { Ticket } from './Checkout'
import PrintTicket from './PrintTicket'

export default function Done({ ticket, onFinish }: { ticket: Ticket; onFinish: () => void }) {
  const { t } = useI18n()
  const [left, setLeft] = useState(15)

  useEffect(() => {
    const timer = setInterval(() => setLeft((s) => s - 1), 1000)
    return () => clearInterval(timer)
  }, [])
  useEffect(() => {
    if (left <= 0) onFinish()
  }, [left, onFinish])

  // Com impressora térmica e o Chrome em modo quiosque (--kiosk-printing), imprime sozinho ao concluir.
  useEffect(() => {
    if (import.meta.env.VITE_AUTO_PRINT === 'true') window.print()
  }, [])

  return (
    <main className="done">
      <div className="check" aria-hidden="true">✓</div>
      <h1>{ticket.cash ? t('done.registered') : t('done.confirmed')}</h1>
      {ticket.cash && (
        <p className="cash-note">💵 {t('done.cashNote', { what: ticket.offline ? t('done.theCode') : t('done.theTicket') })}</p>
      )}
      {ticket.offline ? (
        <>
          <p className="muted">{t('done.offlineNote')}{ticket.cash ? '' : ':'}</p>
          <div className="ticket">
            <small>{t('done.code')}</small>
            <strong className="code">{ticket.clientRef}</strong>
          </div>
        </>
      ) : (
        <>
          {!ticket.cash && <p className="muted">{t('done.keep')}</p>}
          <div className="ticket">
            <small>{t('done.ticket')}</small>
            <strong>{ticket.number}</strong>
          </div>
        </>
      )}
      <button className="btn-ghost" onClick={() => window.print()}>🖨️ {t('done.print')}</button>
      <button className="btn-primary" onClick={onFinish}>{t('done.new', { n: left })}</button>
      <PrintTicket ticket={ticket} />
    </main>
  )
}
