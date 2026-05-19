import type { NewlyEarnedAchievement } from '@the-box/types'
import { showAchievementToast } from '@/components/achievement'
import { playAchievementSound } from '@/lib/audio'

// Achievement keys already surfaced as a toast in this browser session. An
// achievement can only be unlocked once per user, so a process-wide guard
// is safe — and it stops the real-time `/notifications` socket push and the
// results-page render from both toasting the same unlock.
const toastedKeys = new Set<string>()

/**
 * Surface the achievement-unlock toast for any achievements not already
 * shown this session. Plays the celebratory sound once when at least one
 * fresh toast is shown; multiple achievements stagger by 300ms.
 *
 * Safe to call from anywhere — the socket handler and the results page both
 * route through here, so a unlock delivered by both collapses to one toast.
 */
export function notifyAchievementsUnlocked(
    achievements: NewlyEarnedAchievement[]
): void {
    const fresh = achievements.filter((a) => !toastedKeys.has(a.key))
    if (fresh.length === 0) return

    void playAchievementSound()

    fresh.forEach((achievement, index) => {
        toastedKeys.add(achievement.key)
        setTimeout(() => showAchievementToast(achievement), index * 300)
    })
}
