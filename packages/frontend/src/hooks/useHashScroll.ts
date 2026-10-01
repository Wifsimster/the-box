import { useEffect } from 'react'
import { useLocation, useNavigationType } from 'react-router-dom'

/**
 * Long-form pages are reached from the footer, i.e. from the bottom of the
 * previous page, and from deep links such as `/rules#scoring`. React Router
 * handles neither, so: jump to the `#hash` target when there is one, otherwise
 * start at the top — except on back/forward, where the browser restores the
 * previous position.
 */
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
