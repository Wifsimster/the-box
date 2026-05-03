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
    let cancelled = false
    void fetch('/api/user/me', { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (cancelled || !json?.success) return
        const theme = json.data?.selectedTheme ?? 'default'
        applyTheme(theme)
      })
      .catch(() => {
        // No-op: theme defaults to absent attribute → CSS uses the base palette.
      })
    return () => {
      cancelled = true
    }
  }, [userId])
}
