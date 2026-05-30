import { useSyncExternalStore } from 'react'

const MOBILE_QUERY = '(max-width: 767px)'

function subscribe(callback: () => void): () => void {
  const mediaQuery = window.matchMedia(MOBILE_QUERY)
  mediaQuery.addEventListener('change', callback)
  return () => mediaQuery.removeEventListener('change', callback)
}

function getSnapshot(): boolean {
  return window.matchMedia(MOBILE_QUERY).matches
}

// Default to true during SSR/initial render to prevent flash.
function getServerSnapshot(): boolean {
  return true
}

/**
 * Hook to detect if the current viewport is mobile-sized.
 * Uses the md breakpoint (768px) as the threshold.
 */
export function useIsMobile(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}
