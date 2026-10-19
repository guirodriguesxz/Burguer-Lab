import { useEffect, useState } from 'react'
import Kiosk from './kiosk/Kiosk'
import Display from './display/Display'

const isDisplay = () => window.location.hash.startsWith('#/senhas')

export default function App() {
  // Tela de senhas (televisão do salão) fica em /#/senhas; o resto é o totem.
  const [display, setDisplay] = useState(isDisplay)
  useEffect(() => {
    const onHash = () => setDisplay(isDisplay())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])
  return display ? <Display /> : <Kiosk />
}
