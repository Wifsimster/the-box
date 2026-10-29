import { useEffect } from 'react'
import { applyTheme } from '@/lib/themes'

export function useApplyUserTheme(userId: string | undefined): void {
  // oxlint-disable-next-line react-doctor/no-fetch-in-effect
  useEffect(() => {
    if (!userId) {
      document.documentElement.removeAttribute('data-theme')
      return
    }
    const controller = new AbortController()
    void fetch('/api/user/me', { credentials: 'include', signal: controller.signal })
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (!json?.success) return
        const theme = json.data?.selectedTheme ?? 'default'
        applyTheme(theme)
      })
      .catch(() => {
      })
    return () => {
      controller.abort()
    }
  }, [userId])
}
