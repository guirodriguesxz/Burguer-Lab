import { useCallback, useEffect, useReducer, useState } from 'react'
import { io } from 'socket.io-client'
import { fetchUpsell } from '../lib/api'
import { loadMenu, useConnectivity } from '../lib/offline'
import type { CartItem, Category, Mode, Product, UpsellSuggestion } from '../lib/types'
import { I18nProvider, useI18n, type Lang } from '../lib/i18n'
import Welcome from './Welcome'
import Menu from './Menu'
import Customize from './Customize'
import Checkout, { type Ticket } from './Checkout'
import Done from './Done'
import Upsell from './Upsell'

type Screen = 'welcome' | 'menu' | 'checkout' | 'done'

type Action =
  | { type: 'add'; item: CartItem }
  | { type: 'qty'; uid: string; delta: number }
  | { type: 'clear' }

function cartReducer(state: CartItem[], a: Action): CartItem[] {
  switch (a.type) {
    case 'add':
      return [...state, a.item]
    case 'qty':
      return state
        .map((i) => (i.uid === a.uid ? { ...i, qty: i.qty + a.delta } : i))
        .filter((i) => i.qty > 0)
    case 'clear':
      return []
  }
}

const IDLE_MS = 60_000
// Na tela de pagamento o cliente pode estar aguardando o Pix (expira em 5 min).
const IDLE_CHECKOUT_MS = 6 * 60_000

export default function Kiosk() {
  const [lang, setLang] = useState<Lang>('pt')
  return (
    <I18nProvider lang={lang}>
      <KioskScreens lang={lang} setLang={setLang} />
    </I18nProvider>
  )
}

function KioskScreens({ lang, setLang }: { lang: Lang; setLang: (l: Lang) => void }) {
  const { t } = useI18n()
  const [contrast, setContrast] = useState(false)
  const [bigText, setBigText] = useState(false)
  const { online, queued } = useConnectivity()
  const [screen, setScreen] = useState<Screen>('welcome')
  const [mode, setMode] = useState<Mode>('DINE_IN')
  const [menu, setMenu] = useState<{ categories: Category[]; products: Product[]; stale: boolean } | null>(null)
  const [menuError, setMenuError] = useState(false)
  const [cart, dispatch] = useReducer(cartReducer, [])
  const [editing, setEditing] = useState<Product | null>(null)
  const [ticket, setTicket] = useState<Ticket | null>(null)
  const [upsell, setUpsell] = useState<UpsellSuggestion[] | null>(null)
  const [upsellSeen, setUpsellSeen] = useState(false)

  const reset = useCallback(() => {
    dispatch({ type: 'clear' })
    setEditing(null)
    setTicket(null)
    setUpsell(null)
    setUpsellSeen(false)
    // Cada cliente começa do padrão: idioma, contraste e tamanho de texto não passam para o próximo.
    setLang('pt')
    setContrast(false)
    setBigText(false)
    setScreen('welcome')
  }, [setLang])

  useEffect(() => {
    document.documentElement.lang = lang === 'en' ? 'en' : 'pt-BR'
    document.documentElement.classList.toggle('hc', contrast)
    document.documentElement.classList.toggle('big', bigText)
  }, [lang, contrast, bigText])

  // Volta ao início após inatividade (a tela de pedido concluído tem timer próprio).
  useEffect(() => {
    if (screen === 'welcome' || screen === 'done') return
    const ms = screen === 'checkout' ? IDLE_CHECKOUT_MS : IDLE_MS
    let t = setTimeout(reset, ms)
    const bump = () => {
      clearTimeout(t)
      t = setTimeout(reset, ms)
    }
    const events = ['pointerdown', 'keydown']
    events.forEach((e) => window.addEventListener(e, bump))
    return () => {
      clearTimeout(t)
      events.forEach((e) => window.removeEventListener(e, bump))
    }
  }, [screen, reset])

  // Recarrega o cardápio ao entrar na tela de menu e sempre que o servidor avisar (estoque, preço, pausa).
  // Sem rede, usa a última cópia local.
  useEffect(() => {
    if (screen !== 'menu') return
    const load = () =>
      loadMenu()
        .then((m) => {
          setMenu(m)
          setMenuError(false)
        })
        .catch(() => setMenuError(true))
    load()
    const socket = io()
    socket.on('menu:changed', load)
    return () => {
      socket.close()
    }
  }, [screen])

  const addProduct = (p: Product) => {
    if (p.extras.length || p.removable.length) setEditing(p)
    else dispatch({ type: 'add', item: { uid: crypto.randomUUID(), product: p, qty: 1, extras: [], removed: [] } })
  }

  const goCheckout = async () => {
    if (!online || upsellSeen) return setScreen('checkout')
    setUpsellSeen(true)
    try {
      const suggestions = await fetchUpsell(cart.map((i) => i.product.id))
      if (suggestions.length > 0) return setUpsell(suggestions)
    } catch {
      // sugestão é opcional: se falhar, segue para o pagamento
    }
    setScreen('checkout')
  }

  return (
    <div className="kiosk">
      {(!online || queued > 0) && (
        <div className="banner" role="status">
          {!online ? t('banner.offline') : ''}
          {queued > 0 && ` ${t('banner.queued', { n: queued })}`}
        </div>
      )}
      {screen === 'welcome' && (
        <Welcome
          onLang={setLang}
          contrast={contrast}
          onContrast={setContrast}
          bigText={bigText}
          onBigText={setBigText}
          onStart={(m) => {
            setMode(m)
            setScreen('menu')
          }}
        />
      )}
      {screen === 'menu' && menuError && !menu && (
        <main className="checkout">
          <h1>{t('menu.noConnection')}</h1>
          <p className="muted">{t('menu.loadFailed')}</p>
          <button className="btn-primary" onClick={reset}>{t('menu.back')}</button>
        </main>
      )}
      {screen === 'menu' && !menu && !menuError && (
        <main className="checkout" role="status">
          <div className="spinner" />
          <p>{t('menu.loading')}</p>
        </main>
      )}
      {screen === 'menu' && menu && (
        <Menu
          categories={menu.categories}
          products={menu.products}
          cart={cart}
          onAdd={addProduct}
          onQty={(uid, delta) => dispatch({ type: 'qty', uid, delta })}
          onCancel={reset}
          onCheckout={goCheckout}
        />
      )}
      {screen === 'checkout' && (
        <Checkout
          cart={cart}
          mode={mode}
          online={online}
          onBack={() => setScreen('menu')}
          onPaid={(t) => {
            setTicket(t)
            setScreen('done')
          }}
        />
      )}
      {screen === 'done' && ticket && <Done ticket={ticket} onFinish={reset} />}
      {editing && (
        <Customize
          product={editing}
          onClose={() => setEditing(null)}
          onConfirm={(item) => {
            dispatch({ type: 'add', item })
            setEditing(null)
          }}
        />
      )}
      {upsell && (
        <Upsell
          suggestions={upsell}
          onAdd={(id) => {
            const p = menu?.products.find((x) => x.id === id)
            if (p) dispatch({ type: 'add', item: { uid: crypto.randomUUID(), product: p, qty: 1, extras: [], removed: [] } })
          }}
          onContinue={() => {
            setUpsell(null)
            setScreen('checkout')
          }}
        />
      )}
    </div>
  )
}
