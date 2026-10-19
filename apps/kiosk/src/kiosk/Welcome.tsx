import { useI18n, type Lang } from '../lib/i18n'
import type { Mode } from '../lib/types'

interface Props {
  onStart: (m: Mode) => void
  onLang: (l: Lang) => void
  contrast: boolean
  onContrast: (on: boolean) => void
  bigText: boolean
  onBigText: (on: boolean) => void
}

export default function Welcome({ onStart, onLang, contrast, onContrast, bigText, onBigText }: Props) {
  const { t, lang } = useI18n()
  return (
    <main className="welcome">
      <div className="welcome-tools">
        {/* O nome de cada idioma fica no próprio idioma (e marcado com lang), para quem não lê o idioma atual achar o seu. */}
        <div role="group" aria-label={t('welcome.language')} className="seg-tools">
          <button className="tool" lang="pt-BR" aria-pressed={lang === 'pt'} onClick={() => onLang('pt')}>Português</button>
          <button className="tool" lang="en" aria-pressed={lang === 'en'} onClick={() => onLang('en')}>English</button>
        </div>
        <button className="tool" aria-pressed={contrast} onClick={() => onContrast(!contrast)}>◐ {t('a11y.contrast')}</button>
        <button className="tool" aria-pressed={bigText} onClick={() => onBigText(!bigText)}>A+ {t('a11y.bigText')}</button>
      </div>
      <div className="welcome-logo">🍔</div>
      <h1>Burger Lab</h1>
      <p className="welcome-sub">{t('welcome.subtitle')}</p>
      <p className="welcome-ask">{t('welcome.ask')}</p>
      <div className="welcome-actions">
        <button className="btn-xl" onClick={() => onStart('DINE_IN')}>
          <span>🍽️</span> {t('welcome.dineIn')}
        </button>
        <button className="btn-xl alt" onClick={() => onStart('TAKEAWAY')}>
          <span>🛍️</span> {t('welcome.takeaway')}
        </button>
      </div>
    </main>
  )
}
