import type { NewlyEarnedAchievement } from '@the-box/types'
import { toast as sonner } from 'sonner'
import { AchievementToastBody } from './AchievementNotification'

export function showAchievementToast(achievement: NewlyEarnedAchievement): void {
    sonner.custom(
        (id) => <AchievementToastBody achievement={achievement} toastId={id} />,
        { duration: 5000 }
    )
}
