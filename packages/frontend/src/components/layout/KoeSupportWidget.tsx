import { KoeWidget } from '@wifsimster/koe'
import '@wifsimster/koe/style.css'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/hooks/useAuth'

const KOE_PROJECT_KEY = import.meta.env.VITE_KOE_PROJECT_KEY as string | undefined
const KOE_API_URL = import.meta.env.VITE_KOE_API_URL as string | undefined

/**
 * Koe support widget mounted alongside the user menu.
 * Only renders for authenticated users when the Koe env vars are configured,
 * so the launcher appears in-context with the rest of the account controls.
 */
export function KoeSupportWidget() {
  const { user, isAuthenticated } = useAuth()
  const { i18n } = useTranslation()

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
      position="bottom-right"
      theme={{ mode: 'dark' }}
    />
  )
}
