import { useLocation } from 'react-router-dom'
import { useConsentStore } from '@/stores/consentStore'
import { useDailyLoginStore } from '@/stores/dailyLoginStore'
import { useChangelogStore } from '@/stores/changelogStore'
import { useWelcomeActive } from '@/components/onboarding/welcome-storage'

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
    !rewardModalOpen &&
    !changelogOpen &&
    !welcomeActive
  )
}
