import { useEffect } from 'react'
import { applyTheme } from '@/lib/themes'

// Fetches /api/user/me once per session change and applies the user's
// stored theme by setting `data-theme` on <html>. Lives at app level so
// every page boots with the correct skin without each page having to
// re-fetch. Anonymous users get the implicit `default` theme since the
// fetch returns 401 and we leave the attribute alone.
export function useApplyUserTheme(userId: string | undefined): void {
  useEffect(() => {
    if (!userId) {
      // Clear any prior theme attribute on logout so the next user
      // doesn't inherit the previous user's skin from a stale DOM.
      document.documentElement.removeAttribute('data-theme')
      return
    }
    // One-shot fetch with AbortController cleanup. No data-fetching library
    // is available in this app, so this is the documented exception to
    // no-fetch-in-effect: the request is aborted if the effect re-runs or
    // unmounts before it settles, preventing stale theme application.
    const controller = new AbortController()
    void fetch('/api/user/me', { credentials: 'include', signal: controller.signal })
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (!json?.success) return
        const theme = json.data?.selectedTheme ?? 'default'
        applyTheme(theme)
      })
      .catch(() => {
        // No-op: aborted requests and failures both leave the attribute
        // absent → CSS uses the base palette.
      })
    return () => {
      controller.abort()
    }
  }, [userId])
}
