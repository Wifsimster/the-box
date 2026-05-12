import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'

interface GoatCounter {
  count: (opts?: { path?: string; title?: string; event?: boolean; referrer?: string }) => void
  no_onload?: boolean
}

declare global {
  interface Window {
    goatcounter?: GoatCounter
  }
}

/**
 * Injects the self-hosted GoatCounter count.js if VITE_GOATCOUNTER_URL is
 * configured. The env var must be the data-goatcounter beacon URL — the
 * script URL is derived by swapping the trailing /count for /count.js so
 * both subdomain (the-box.stats.example.com/count) and path-prefixed
 * (stats.example.com/the-box/count) installs work without extra config.
 */
export function loadGoatCounter(): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return

  const endpoint = import.meta.env.VITE_GOATCOUNTER_URL
  if (!endpoint) return
  if (document.querySelector('script[data-goatcounter]')) return

  const scriptUrl = endpoint.replace(/\/count$/, '/count.js')

  const tag = document.createElement('script')
  tag.async = true
  tag.src = scriptUrl
  tag.setAttribute('data-goatcounter', endpoint)
  document.head.appendChild(tag)
}

/**
 * Re-emits a GoatCounter pageview on every react-router navigation. The
 * count.js auto-tracks the initial load; SPA route changes need a manual
 * count() call or the dashboard only ever sees the entry page.
 */
export function useGoatCounterPageviews(): void {
  const location = useLocation()

  useEffect(() => {
    if (!window.goatcounter || typeof window.goatcounter.count !== 'function') return
    window.goatcounter.count({
      path: location.pathname + location.search + location.hash,
      title: document.title,
    })
  }, [location.pathname, location.search, location.hash])
}
