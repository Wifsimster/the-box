import { useEffect } from 'react'
import { useLocation, useNavigationType } from 'react-router-dom'

export function useHashScroll() {
  const { hash } = useLocation()
  const navigationType = useNavigationType()

  useEffect(() => {
    const id = decodeURIComponent(hash.slice(1))
    if (!id) {
      if (navigationType !== 'POP') window.scrollTo(0, 0)
      return
    }
    const frame = requestAnimationFrame(() => {
      document.getElementById(id)?.scrollIntoView({ block: 'start' })
    })
    return () => cancelAnimationFrame(frame)
  }, [hash, navigationType])
}
