import { useLocation } from 'react-router-dom'
import { useConsentStore } from '@/stores/consentStore'
import { useDailyLoginStore } from '@/stores/dailyLoginStore'
import { useChangelogStore } from '@/stores/changelogStore'
import { useWelcomeActive } from '@/components/onboarding/welcome-storage'
import { isTodayPath } from '@/lib/dailyFirst'

export const IN_GAME_PATH = /\/(play|geo)\/?$/

export function useBottomPromptSlotFree(): boolean {
  const { pathname } = useLocation()
  const consentDecided = useConsentStore((s) => s.decided)
  const rewardModalOpen = useDailyLoginStore((s) => s.isModalOpen)
  const changelogOpen = useChangelogStore((s) => s.open)
  const welcomeActive = useWelcomeActive()
  return (
    consentDecided &&
    !IN_GAME_PATH.test(pathname) &&
    !isTodayPath(pathname) &&
    !rewardModalOpen &&
    !changelogOpen &&
    !welcomeActive
  )
}
