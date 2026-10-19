import { useEffect, useState } from 'react'
import { ApiError, fetchMenu, sendOrder } from './api'
import type { Category, OrderPayload, Product } from './types'

const QUEUE_KEY = 'totem:queue'
const MENU_KEY = 'totem:menu'
const FAILED_KEY = 'totem:failed'

interface QueuedOrder {
  key: string
  payload: OrderPayload
  createdAt: number
}

function read<T>(key: string, fallback: T): T {
  try {
    return JSON.parse(localStorage.getItem(key) ?? 'null') ?? fallback
  } catch {
    return fallback
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // armazenamento cheio/indisponível: a fila vale só enquanto a página estiver aberta
  }
}

/** Código curto para identificar o pedido offline no balcão e na cozinha (sem 0/O/1/I). */
export function newClientRef() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const bytes = crypto.getRandomValues(new Uint8Array(4))
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('')
}

export const queuedCount = () => read<QueuedOrder[]>(QUEUE_KEY, []).length

export function enqueueOrder(payload: OrderPayload, key: string) {
  write(QUEUE_KEY, [...read<QueuedOrder[]>(QUEUE_KEY, []), { key, payload, createdAt: Date.now() }])
  window.dispatchEvent(new Event('totem:queue'))
}

let flushing = false

/**
 * Envia os pedidos guardados, em ordem. A mesma Idempotency-Key garante que uma retentativa
 * não cria pedido duplicado. Recusa do servidor (ex.: estoque esgotou) tira o pedido da fila
 * e o registra em "failed"; erro de rede interrompe e tenta de novo depois.
 */
export async function flushQueue() {
  if (flushing) return
  flushing = true
  try {
    let queue = read<QueuedOrder[]>(QUEUE_KEY, [])
    while (queue.length > 0) {
      const [next, ...rest] = queue
      try {
        await sendOrder(next.payload, next.key)
      } catch (e) {
        // Rede fora, erro do servidor (5xx), "devagar" (429) ou timeout (408) são temporários: o pedido
        // continua na fila para a próxima tentativa. Só uma recusa definitiva (4xx) tira o pedido da fila.
        const transient = !(e instanceof ApiError) || e.status >= 500 || e.status === 429 || e.status === 408
        if (transient) break
        write(FAILED_KEY, [...read<unknown[]>(FAILED_KEY, []), { ...next, reason: e.message }])
      }
      queue = rest
      write(QUEUE_KEY, queue)
      window.dispatchEvent(new Event('totem:queue'))
    }
  } finally {
    flushing = false
  }
}

/** Cardápio com cópia local: se a rede cair, o totem continua mostrando o último cardápio conhecido. */
export async function loadMenu(): Promise<{ categories: Category[]; products: Product[]; stale: boolean }> {
  try {
    const menu = await fetchMenu()
    write(MENU_KEY, menu)
    return { ...menu, stale: false }
  } catch (e) {
    const cached = read<{ categories: Category[]; products: Product[] } | null>(MENU_KEY, null)
    if (cached && !(e instanceof ApiError)) return { ...cached, stale: true }
    throw e
  }
}

/** Estado de conexão do navegador + tamanho da fila de pedidos offline. */
export function useConnectivity() {
  const [online, setOnline] = useState(navigator.onLine)
  const [queued, setQueued] = useState(queuedCount)

  useEffect(() => {
    const syncQueue = () => setQueued(queuedCount())
    const goOnline = () => {
      setOnline(true)
      flushQueue()
    }
    const goOffline = () => setOnline(false)
    window.addEventListener('online', goOnline)
    window.addEventListener('offline', goOffline)
    window.addEventListener('totem:queue', syncQueue)
    // Rede "online" não garante servidor alcançável: tenta esvaziar a fila periodicamente.
    const t = setInterval(() => queuedCount() > 0 && flushQueue(), 15_000)
    if (navigator.onLine) flushQueue()
    return () => {
      window.removeEventListener('online', goOnline)
      window.removeEventListener('offline', goOffline)
      window.removeEventListener('totem:queue', syncQueue)
      clearInterval(t)
    }
  }, [])

  return { online, queued }
}
