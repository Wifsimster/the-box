import { useLocation } from 'react-router-dom'
import { useConsentStore } from '@/stores/consentStore'
import { useDailyLoginStore } from '@/stores/dailyLoginStore'
import { useChangelogStore } from '@/stores/changelogStore'
import { useWelcomeActive } from '@/components/onboarding/welcome-storage'
import { isTodayPath } from '@/lib/dailyFirst'

export const IN_GAME_PATH = /\/(play|geo)\/?$/

/**
 * Whether a passive bottom prompt (install banner, iOS hint) may show right
 * now: never on top of the cookie banner, never mid-game, and never while an
 * auto-opened dialog is still asking for the player's attention.
 */
export function useBottomPromptSlotFree(): boolean {
  const { pathname } = useLocation()
  const consentDecided = useConsentStore((s) => s.decided)
  const rewardModalOpen = useDailyLoginStore((s) => s.isModalOpen)
  const changelogOpen = useChangelogStore((s) => s.open)
  const welcomeActive = useWelcomeActive()
  return (
    consentDecided &&
    !IN_GAME_PATH.test(pathname) &&
    // The bare language root is today's box in the daily-first IA: no install
    // banner over the screenshot either.
    !isTodayPath(pathname) &&
    !rewardModalOpen &&
    !changelogOpen &&
    !welcomeActive
  )
}
