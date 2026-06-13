import { useCallback } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useSession, signOut as authSignOut } from '@/lib/auth-client'
import { useGameStore } from '@/stores/gameStore'
import { useDailyLoginStore } from '@/stores/dailyLoginStore'
import { useAchievementStore } from '@/stores/achievementStore'

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
    } catch (err) {
      console.error('Sign out failed:', err)
    } finally {
      // Clear per-user client state so a subsequent login on the same
      // browser doesn't briefly see the previous user's game session
      // (persisted in localStorage), inventory, or achievement
      // notifications.
      useGameStore.getState().resetGame()
      useDailyLoginStore.getState().reset()
      useAchievementStore.getState().reset()
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
