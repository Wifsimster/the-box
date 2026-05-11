import { useEffect, useState } from 'react'
import { KoeWidget } from '@wifsimster/koe'
import '@wifsimster/koe/style.css'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/hooks/useAuth'
import { koeApi } from '@/lib/api'

const KOE_PROJECT_KEY = import.meta.env.VITE_KOE_PROJECT_KEY as string | undefined
const KOE_API_URL = import.meta.env.VITE_KOE_API_URL as string | undefined

/**
 * Koe support widget mounted alongside the user menu.
 * Only renders for authenticated users when the Koe env vars are configured,
 * so the launcher appears in-context with the rest of the account controls.
 *
 * The userHash is fetched from /api/koe/identity (HMAC-SHA256 of user.id
 * with KOE_IDENTITY_SECRET) so the Koe backend can verify the requesting
 * user. If the backend hasn't been configured with the secret it returns
 * 204 and the widget falls back to unverified mode.
 */
export function KoeSupportWidget() {
  const { user, isAuthenticated } = useAuth()
  const { i18n } = useTranslation()
  const [userHash, setUserHash] = useState<string | null>(null)

  const userId = user?.id
  useEffect(() => {
    if (!userId) return
    let cancelled = false
    koeApi
      .getIdentity()
      .then((hash) => {
        if (!cancelled) setUserHash(hash)
      })
      .catch(() => {
        if (!cancelled) setUserHash(null)
      })
    return () => {
      cancelled = true
    }
  }, [userId])

  if (!KOE_PROJECT_KEY || !KOE_API_URL) return null
  if (!isAuthenticated || !user?.id) return null

  return (
    <KoeWidget
      projectKey={KOE_PROJECT_KEY}
      apiUrl={KOE_API_URL}
      user={{
        id: user.id,
        name: user.name ?? undefined,
        email: user.email ?? undefined,
        metadata: {
          role: user.role ?? 'user',
          locale: i18n.language,
        },
      }}
      userHash={userHash ?? undefined}
      position="bottom-right"
      theme={{ mode: 'dark' }}
    />
  )
}
