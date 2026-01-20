import { cn } from '@/lib/utils'
import { useTranslation } from 'react-i18next'
import { Check, Gift, Lock } from 'lucide-react'
import type { DailyReward } from '@the-box/types'

interface RewardCalendarProps {
    rewards: DailyReward[]
    currentDayInCycle: number
    hasClaimedToday: boolean
    className?: string
}

export function RewardCalendar({
    rewards,
    currentDayInCycle,
    hasClaimedToday,
    className,
}: RewardCalendarProps) {
    const { t } = useTranslation()

    const getRewardStatus = (dayNumber: number) => {
        if (dayNumber < currentDayInCycle) {
            return 'claimed'
        }
        if (dayNumber === currentDayInCycle) {
            return hasClaimedToday ? 'claimed' : 'available'
        }
        return 'locked'
    }

    const getRewardTypeIcon = (reward: DailyReward) => {
        if (reward.rewardType === 'legendary') {
            return '🎁'
        }
        if (reward.rewardType === 'points') {
            return '⭐'
        }
        // Power-up type
        const items = reward.rewardValue.items
        if (items.length > 0) {
            const item = items[0]
            if (item?.key === 'hint_year') return '📅'
            if (item?.key === 'hint_publisher') return '🏢'
        }
        return '🎮'
    }

    return (
        <div className={cn('space-y-2', className)}>
            <div className="text-xs text-muted-foreground text-center mb-3">
                {t('dailyLogin.weeklyProgress')}
            </div>
            <div className="grid grid-cols-7 gap-1 sm:gap-2">
                {rewards.map((reward) => {
                    const status = getRewardStatus(reward.dayNumber)
                    const isToday = reward.dayNumber === currentDayInCycle
                    const isClaimed = status === 'claimed'
                    const isLocked = status === 'locked'
                    const isAvailable = status === 'available'

                    return (
                        <div
                            key={reward.dayNumber}
                            className={cn(
                                'relative flex flex-col items-center justify-center p-1 sm:p-2 rounded-lg border transition-all',
                                isToday && 'ring-2 ring-primary ring-offset-2 ring-offset-background',
                                isClaimed && 'bg-green-500/10 border-green-500/30',
                                isAvailable && 'bg-primary/10 border-primary/30 animate-pulse',
                                isLocked && 'bg-muted/20 border-muted/30 opacity-50'
                            )}
                        >
                            {/* Day number */}
                            <span className={cn(
                                'text-[10px] sm:text-xs font-medium',
                                isClaimed && 'text-green-400',
                                isAvailable && 'text-primary',
                                isLocked && 'text-muted-foreground'
                            )}>
                                {t('dailyLogin.day')} {reward.dayNumber}
                            </span>

                            {/* Icon */}
                            <div className={cn(
                                'text-lg sm:text-2xl my-1',
                                isLocked && 'grayscale'
                            )}>
                                {isClaimed ? (
                                    <Check className="w-4 h-4 sm:w-6 sm:h-6 text-green-400" />
                                ) : isLocked ? (
                                    <Lock className="w-4 h-4 sm:w-5 sm:h-5 text-muted-foreground" />
                                ) : (
                                    <span>{getRewardTypeIcon(reward)}</span>
                                )}
                            </div>

                            {/* Reward preview */}
                            <span className={cn(
                                'text-[8px] sm:text-[10px] text-center leading-tight truncate max-w-full px-0.5',
                                isClaimed && 'text-green-400/70',
                                isAvailable && 'text-primary/80',
                                isLocked && 'text-muted-foreground/50'
                            )}>
                                {reward.rewardType === 'legendary' ? (
                                    <Gift className="w-3 h-3 inline" />
                                ) : reward.rewardValue.points > 0 ? (
                                    `+${reward.rewardValue.points}`
                                ) : (
                                    `x${reward.rewardValue.items.reduce((acc: number, i: { quantity: number }) => acc + i.quantity, 0)}`
                                )}
                            </span>
                        </div>
                    )
                })}
            </div>
        </div>
    )
}
