import { useCallback } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useSession, signOut as authSignOut } from '@/lib/auth-client'

/**
 * Custom hook for authentication logic
 *
 * Encapsulates auth state and navigation logic, following Single Responsibility
 */
export function useAuth() {
  const navigate = useNavigate()
  const { lang } = useParams<{ lang: string }>()
  const { i18n } = useTranslation()
  const { data: session, isPending, error } = useSession()
  
  // Log session errors for debugging
  if (error) {
    console.error('Session error:', error)
  }

  const currentLang = lang || i18n.language

  const signOut = useCallback(async () => {
    try {
      const result = await authSignOut()
      if (result.error) {
        console.error('Sign out error:', result.error)
      }
      // Navigate regardless of error to ensure user is redirected
      navigate(`/${currentLang}`)
    } catch (err) {
      console.error('Sign out failed:', err)
      // Navigate even on error to ensure user is redirected
      navigate(`/${currentLang}`)
    }
  }, [navigate, currentLang])

  const signIn = useCallback(
    (redirectTo?: string) => {
      navigate(`/${currentLang}/login`, { state: { redirectTo } })
    },
    [navigate, currentLang]
  )

  const signUp = useCallback(() => {
    navigate(`/${currentLang}/register`)
  }, [navigate, currentLang])

  return {
    session,
    isPending,
    isAuthenticated: !!session,
    user: session?.user || null,
    signOut,
    signIn,
    signUp,
  }
}
