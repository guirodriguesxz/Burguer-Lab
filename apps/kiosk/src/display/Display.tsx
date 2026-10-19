import { useCallback, useEffect, useRef, useState } from 'react'
import { io } from 'socket.io-client'
import { fetchQueue } from '../lib/api'

interface Queue {
  preparing: number[]
  ready: number[]
}

/** Toca um "ding" curto e fala a senha em português. Só funciona depois de o usuário ativar o som (política dos navegadores). */
function announce(ticket: number, ctx: AudioContext | null) {
  if (ctx) {
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.frequency.value = 880
    gain.gain.setValueAtTime(0.2, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6)
    osc.connect(gain).connect(ctx.destination)
    osc.start()
    osc.stop(ctx.currentTime + 0.6)
  }
  if ('speechSynthesis' in window) {
    const u = new SpeechSynthesisUtterance(`Senha ${ticket}, pronta para retirada`)
    u.lang = 'pt-BR'
    window.speechSynthesis.speak(u)
  }
}

/** Tela de senhas para a televisão do salão: quem está preparando e quem já pode retirar. */
export default function Display() {
  const [queue, setQueue] = useState<Queue>({ preparing: [], ready: [] })
  const [flash, setFlash] = useState<number[]>([])
  const [offline, setOffline] = useState(false)
  const [sound, setSound] = useState(false)
  const audio = useRef<AudioContext | null>(null)
  const prevReady = useRef<number[] | null>(null)
  const soundOn = useRef(false)

  const load = useCallback(async () => {
    try {
      const q = await fetchQueue()
      setOffline(false)
      setQueue(q)
      // Senhas que acabaram de ficar prontas: destaca por alguns segundos e avisa.
      const fresh = prevReady.current ? q.ready.filter((t) => !prevReady.current!.includes(t)) : []
      prevReady.current = q.ready
      if (fresh.length > 0) {
        setFlash((f) => [...f, ...fresh])
        setTimeout(() => setFlash((f) => f.filter((t) => !fresh.includes(t))), 8000)
        if (soundOn.current) fresh.forEach((t) => announce(t, audio.current))
      }
    } catch {
      setOffline(true)
    }
  }, [])

  useEffect(() => {
    load()
    const socket = io()
    socket.on('queue:changed', load)
    const t = setInterval(load, 15_000) // rede de segurança caso o WebSocket caia
    return () => {
      socket.close()
      clearInterval(t)
    }
  }, [load])

  const enableSound = () => {
    audio.current = new AudioContext()
    soundOn.current = true
    setSound(true)
  }

  return (
    <main className="display">
      <header>
        <h1>🍔 Burger Lab</h1>
        {offline && <span className="display-offline">sem conexão…</span>}
        {!sound && (
          <button className="display-sound" onClick={enableSound}>
            🔊 Ativar som
          </button>
        )}
      </header>
      <div className="display-cols">
        <section aria-label="Em preparo">
          <h2>Em preparo</h2>
          <ul>
            {queue.preparing.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </section>
        <section className="ready" aria-label="Pronto para retirar">
          <h2>Pronto, retire no balcão</h2>
          <ul>
            {queue.ready.map((t) => (
              <li key={t} className={flash.includes(t) ? 'flash' : ''}>
                {t}
              </li>
            ))}
          </ul>
        </section>
      </div>
    </main>
  )
}
