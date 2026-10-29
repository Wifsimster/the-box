import type { NewlyEarnedAchievement } from '@the-box/types'
import { showAchievementToast } from '@/components/achievement'
import { playAchievementSound } from '@/lib/audio'

const toastedKeys = new Set<string>()

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
