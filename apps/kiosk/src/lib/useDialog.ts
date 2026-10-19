import { useEffect, useRef } from 'react'

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'

/**
 * Comportamento de teclado de um diálogo modal:
 * - ao abrir, o foco vai para o primeiro controle (ou para o próprio diálogo);
 * - Tab e Shift+Tab ficam presos dentro dele (não vazam para a página de trás);
 * - Esc fecha (quando há `onClose`);
 * - ao fechar, o foco volta para o botão que o abriu.
 * Use: `const ref = useDialog<HTMLDivElement>(onClose)` e `<div ref={ref} tabIndex={-1}>`.
 */
export function useDialog<T extends HTMLElement>(onClose?: () => void) {
  const ref = useRef<T>(null)
  const closeRef = useRef(onClose)
  closeRef.current = onClose

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null
    const root = ref.current
    const items = () => Array.from(root?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []).filter((el) => el.offsetParent !== null)
    ;(items()[0] ?? root)?.focus()

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && closeRef.current) {
        e.stopPropagation()
        closeRef.current()
        return
      }
      if (e.key !== 'Tab') return
      const list = items()
      if (list.length === 0) return e.preventDefault()
      const first = list[0]
      const last = list[list.length - 1]
      const active = document.activeElement
      if (e.shiftKey && (active === first || !root?.contains(active))) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && (active === last || !root?.contains(active))) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      opener?.focus?.() // devolve o foco a quem abriu
    }
  }, [])

  return ref
}
