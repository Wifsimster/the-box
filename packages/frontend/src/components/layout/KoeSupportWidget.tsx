import { useEffect, useState } from 'react'
import { KoeWidget } from '@wifsimster/koe'
import '@wifsimster/koe/style.css'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/hooks/useAuth'
import { koeApi } from '@/lib/api'
import { useConsentStore } from '@/stores/consentStore'

const KOE_PROJECT_KEY = import.meta.env.VITE_KOE_PROJECT_KEY as string | undefined
const KOE_API_URL = import.meta.env.VITE_KOE_API_URL as string | undefined

export function KoeSupportWidget() {
  const { user, isAuthenticated } = useAuth()
  const { i18n } = useTranslation()
  const supportConsent = useConsentStore((s) => s.support)
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
  if (supportConsent !== true) return null

  return (
    <>
      <style>{`.koe-root button[aria-expanded="false"]{display:none!important;}`}</style>
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
    </>
  )
}
