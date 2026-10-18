import { useCallback, useEffect, useReducer, useState } from 'react'
import type { CartItem, Category, Mode, Order, Product } from '../lib/types'
import { io } from 'socket.io-client'
import { fetchMenu } from '../lib/api'
import Welcome from './Welcome'
import Menu from './Menu'
import Customize from './Customize'
import Checkout from './Checkout'
import Done from './Done'

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

export default function Kiosk() {
  const [screen, setScreen] = useState<Screen>('welcome')
  const [mode, setMode] = useState<Mode>('DINE_IN')
  const [menu, setMenu] = useState<{ categories: Category[]; products: Product[] } | null>(null)
  const [menuError, setMenuError] = useState(false)
  const [cart, dispatch] = useReducer(cartReducer, [])
  const [editing, setEditing] = useState<Product | null>(null)
  const [order, setOrder] = useState<Order | null>(null)

  const reset = useCallback(() => {
    dispatch({ type: 'clear' })
    setEditing(null)
    setOrder(null)
    setScreen('welcome')
  }, [])

  // Volta ao início após inatividade (a tela de pedido concluído tem timer próprio).
  useEffect(() => {
    if (screen === 'welcome' || screen === 'done') return
    let t = setTimeout(reset, IDLE_MS)
    const bump = () => {
      clearTimeout(t)
      t = setTimeout(reset, IDLE_MS)
    }
    const events = ['pointerdown', 'keydown']
    events.forEach((e) => window.addEventListener(e, bump))
    return () => {
      clearTimeout(t)
      events.forEach((e) => window.removeEventListener(e, bump))
    }
  }, [screen, reset])

  // Recarrega o cardápio ao entrar na tela de menu e sempre que o servidor avisar (estoque, preço, pausa).
  useEffect(() => {
    if (screen !== 'menu') return
    const load = () =>
      fetchMenu()
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

  return (
    <div className="kiosk">
      {screen === 'welcome' && (
        <Welcome
          onStart={(m) => {
            setMode(m)
            setScreen('menu')
          }}
        />
      )}
      {screen === 'menu' && menuError && !menu && (
        <main className="checkout">
          <h1>Sem conexão</h1>
          <p className="muted">Não foi possível carregar o cardápio.</p>
          <button className="btn-primary" onClick={reset}>Voltar</button>
        </main>
      )}
      {screen === 'menu' && !menu && !menuError && (
        <main className="checkout" role="status">
          <div className="spinner" />
          <p>Carregando cardápio…</p>
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
          onCheckout={() => setScreen('checkout')}
        />
      )}
      {screen === 'checkout' && (
        <Checkout
          cart={cart}
          mode={mode}
          onBack={() => setScreen('menu')}
          onPaid={(o) => {
            setOrder(o)
            setScreen('done')
          }}
        />
      )}
      {screen === 'done' && order && <Done order={order} onFinish={reset} />}
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
    </div>
  )
}
