import { useState, useEffect } from 'react'

/**
 * Hook to detect if the current viewport is mobile-sized.
 * Uses the md breakpoint (768px) as the threshold.
 */
export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(() => {
    // Default to true during SSR/initial render to prevent flash
    if (typeof window === 'undefined') return true
    return window.innerWidth < 768
  })

  useEffect(() => {
    const mediaQuery = window.matchMedia('(max-width: 767px)')

    // Set initial value
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Necessary to sync state with media query on mount
    setIsMobile(mediaQuery.matches)

    // Listen for changes
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches)
    mediaQuery.addEventListener('change', handler)

    return () => mediaQuery.removeEventListener('change', handler)
  }, [])

  return isMobile
}
