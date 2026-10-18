import { useEffect, useState } from 'react'
import Kiosk from './kiosk/Kiosk'
import Kitchen from './kitchen/Kitchen'

const isKitchen = () => window.location.hash.startsWith('#/cozinha')

export default function App() {
  const [kitchen, setKitchen] = useState(isKitchen)
  useEffect(() => {
    const onHash = () => setKitchen(isKitchen())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])
  return kitchen ? <Kitchen /> : <Kiosk />
}
