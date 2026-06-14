import { cn } from '@/lib/utils'
import { useTranslation } from 'react-i18next'
import { Check, Gift, Lock } from 'lucide-react'
import type { DailyReward } from '@the-box/types'
import { getRarityStyle, getRewardRarity } from '@/lib/rarity'

interface RewardCalendarProps {
    rewards: DailyReward[]
    currentDayInCycle: number
    hasClaimedToday: boolean
    className?: string
}

function getRewardTypeIcon(reward: DailyReward) {
    if (reward.rewardType === 'legendary') {
        return '🎁'
    }
    if (reward.rewardType === 'points') {
        return '⭐'
    }
    // Power-up type. Legacy metadata-hint keys (retired 2026-06) fall
    // through to the generic icon.
    const items = reward.rewardValue.items
    if (items.length > 0) {
        const item = items[0]
        if (item?.key === 'hint_letter') return '🔤'
        if (item?.key === 'streak_freeze') return '❄️'
        if (item?.key === 'second_chance') return '🛡️'
    }
    return '🎮'
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

                    const rarity = getRewardRarity(reward)
                    const rarityStyle = getRarityStyle(reward)

                    return (
                        <div
                            key={reward.dayNumber}
                            title={t(rarityStyle.labelKey)}
                            style={
                                isAvailable
                                    ? { boxShadow: rarityStyle.glow }
                                    : undefined
                            }
                            className={cn(
                                'relative flex flex-col items-center justify-center p-1 sm:p-2 rounded-lg border transition-all',
                                // Rarity tint is always present so the colour
                                // reads as the day's prestige, not just its state.
                                rarityStyle.cell,
                                isToday && cn('ring-2 ring-offset-2 ring-offset-background', rarityStyle.ring),
                                isAvailable && 'animate-pulse',
                                isClaimed && 'opacity-70',
                                isLocked && 'opacity-50'
                            )}
                        >
                            {/* Rarity indicator dot */}
                            <span
                                className={cn(
                                    'absolute top-1 right-1 size-1.5 rounded-full',
                                    rarityStyle.text,
                                    'bg-current'
                                )}
                                aria-hidden
                            />

                            {/* Day number */}
                            <span className={cn(
                                'text-[10px] sm:text-xs font-medium',
                                rarityStyle.text
                            )}>
                                {t('dailyLogin.day')} {reward.dayNumber}
                            </span>

                            {/* Icon */}
                            <div className={cn(
                                'text-lg sm:text-2xl my-1',
                                isLocked && 'grayscale'
                            )}>
                                {isClaimed ? (
                                    <Check className={cn('size-4 sm:size-6', rarityStyle.text)} />
                                ) : isLocked ? (
                                    <Lock className="size-4 sm:size-5 text-muted-foreground" />
                                ) : (
                                    <span>{getRewardTypeIcon(reward)}</span>
                                )}
                            </div>

                            {/* Reward preview */}
                            <span className={cn(
                                'text-[8px] sm:text-[10px] text-center leading-tight truncate max-w-full px-0.5',
                                rarity === 'legendary' ? rarityStyle.text : 'text-muted-foreground'
                            )}>
                                {reward.rewardType === 'legendary' ? (
                                    <Gift className="size-3 inline" />
                                ) : reward.rewardValue.points > 0 ? (
                                    `+${reward.rewardValue.points}`
                                ) : (
                                    `${reward.rewardValue.items.reduce((acc: number, i: { quantity: number }) => acc + i.quantity, 0)}×`
                                )}
                            </span>
                        </div>
                    )
                })}
            </div>
        </div>
    )
}
