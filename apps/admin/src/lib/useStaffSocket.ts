import { useEffect, useRef, useState } from 'react'
import { io } from 'socket.io-client'
import { fetchMe, type Order } from './api'

interface Handlers {
  onCreated: (o: Order) => void
  onUpdated: (o: Order) => void
  /** Pedido novo aguardando pagamento no caixa. */
  onPending?: (o: Order) => void
  /** Chamado a cada (re)conexão, para ressincronizar o que foi perdido offline. */
  onConnect: () => void
}

/**
 * Conecta ao WebSocket da equipe e informa se está online. A autenticação é o cookie de sessão (o navegador
 * o envia sozinho). Quando o servidor encerra a conexão (senha trocada, acesso alterado, logout), o socket.io
 * não reconecta por conta própria: confere a sessão com /auth/me. Se caiu, a tela volta ao login; se
 * continua válida (ex.: senha trocada nesta própria tela), reconecta.
 */
export function useStaffSocket(handlers: Handlers) {
  const [online, setOnline] = useState(false)
  const ref = useRef(handlers)
  ref.current = handlers

  useEffect(() => {
    const socket = io({ withCredentials: true })
    socket.on('connect', () => {
      setOnline(true)
      ref.current.onConnect()
    })
    socket.on('disconnect', (reason) => {
      setOnline(false)
      if (reason === 'io server disconnect') {
        fetchMe()
          .then(() => socket.connect())
          .catch(() => undefined) // 401 já dispara o retorno ao login
      }
    })
    socket.on('order:created', (o: Order) => ref.current.onCreated(o))
    socket.on('order:updated', (o: Order) => ref.current.onUpdated(o))
    socket.on('order:pending', (o: Order) => ref.current.onPending?.(o))
    return () => {
      socket.close()
    }
  }, [])

  return online
}
