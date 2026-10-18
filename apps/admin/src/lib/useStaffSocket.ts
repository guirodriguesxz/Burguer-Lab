import { useEffect, useRef, useState } from 'react'
import { io } from 'socket.io-client'
import type { Order } from './api'

interface Handlers {
  onCreated: (o: Order) => void
  onUpdated: (o: Order) => void
  /** Chamado a cada (re)conexão, para ressincronizar o que foi perdido offline. */
  onConnect: () => void
}

/** Conecta ao WebSocket autenticado (sala "staff") e informa se está online. */
export function useStaffSocket(token: string, handlers: Handlers) {
  const [online, setOnline] = useState(false)
  const ref = useRef(handlers)
  ref.current = handlers

  useEffect(() => {
    const socket = io({ auth: { token } })
    socket.on('connect', () => {
      setOnline(true)
      ref.current.onConnect()
    })
    socket.on('disconnect', () => setOnline(false))
    socket.on('order:created', (o: Order) => ref.current.onCreated(o))
    socket.on('order:updated', (o: Order) => ref.current.onUpdated(o))
    return () => {
      socket.close()
    }
  }, [token])

  return online
}
