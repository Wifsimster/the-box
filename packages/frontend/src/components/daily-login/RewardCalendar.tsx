import { cn } from '@/lib/utils'
import { useTranslation } from 'react-i18next'
import { Check, Lock } from 'lucide-react'
import type { DailyReward } from '@the-box/types'
import { getRarityStyle, getRewardRarity } from '@/lib/rarity'
import { RewardIcon, getRewardShortValue } from './RewardIcon'

interface RewardCalendarProps {
    rewards: DailyReward[]
    currentDayInCycle: number
    hasClaimedToday: boolean
    className?: string
}

type DayStatus = 'claimed' | 'available' | 'locked'

export function RewardCalendar({
    rewards,
    currentDayInCycle,
    hasClaimedToday,
    className,
}: RewardCalendarProps) {
    const { t } = useTranslation()

    const getRewardStatus = (dayNumber: number): DayStatus => {
        if (dayNumber < currentDayInCycle) return 'claimed'
        if (dayNumber === currentDayInCycle) return hasClaimedToday ? 'claimed' : 'available'
        return 'locked'
    }

    // The track fills from day 1 to the last claimed day. With 7 columns the
    // rail runs between the centres of the first and last cells, i.e. it is
    // inset by half a column (100% / 14) on each side.
    const lastClaimedDay = hasClaimedToday ? currentDayInCycle : currentDayInCycle - 1
    const segments = Math.max(rewards.length - 1, 1)
    const fillRatio = Math.min(Math.max((lastClaimedDay - 1) / segments, 0), 1)
    const railInset = `${100 / (rewards.length * 2)}%`

    return (
        <div className={cn('relative', className)}>
            {/* Rail behind the nodes: muted base + progress fill */}
            <div
                aria-hidden
                className="absolute top-5 sm:top-6 h-1 -translate-y-1/2 rounded-full bg-muted"
                style={{ left: railInset, right: railInset }}
            >
                <div
                    className="h-full rounded-full bg-linear-to-r from-neon-purple to-neon-pink motion-safe:transition-[width] motion-safe:duration-700"
                    style={{ width: `${fillRatio * 100}%` }}
                />
            </div>

            <ol className="relative grid grid-cols-7 gap-1">
                {rewards.map((reward) => {
                    const status = getRewardStatus(reward.dayNumber)
                    const isToday = reward.dayNumber === currentDayInCycle
                    const isClaimed = status === 'claimed'
                    const isLocked = status === 'locked'
                    const isChest = reward.rewardType === 'legendary'

                    const rarity = getRewardRarity(reward)
                    const rarityStyle = getRarityStyle(reward)
                    const name = t(`dailyLogin.rewards.day${reward.dayNumber}.name`, {
                        defaultValue: reward.displayName,
                    })

                    return (
                        <li
                            key={reward.dayNumber}
                            className="flex flex-col items-center gap-1"
                            title={`${name} · ${t(rarityStyle.labelKey)}`}
                            aria-current={isToday ? 'step' : undefined}
                        >
                            <div
                                style={isToday ? { boxShadow: rarityStyle.glow } : undefined}
                                className={cn(
                                    'relative flex items-center justify-center rounded-full border-2 bg-card transition-all',
                                    isChest ? 'size-10 sm:size-12' : 'size-9 sm:size-11 mt-0.5 sm:mt-0.5',
                                    // Claimed days read as "done": solid gradient, no rarity noise.
                                    isClaimed && 'border-transparent bg-linear-to-br from-neon-purple to-neon-pink text-white',
                                    !isClaimed && rarityStyle.cell,
                                    isToday && !isClaimed && cn('ring-2 ring-offset-2 ring-offset-card', rarityStyle.ring),
                                    isToday && isClaimed && 'ring-2 ring-neon-pink/40 ring-offset-2 ring-offset-card',
                                    status === 'available' && 'motion-safe:animate-pulse'
                                )}
                            >
                                {isClaimed ? (
                                    <Check className="size-4 sm:size-5" strokeWidth={3} aria-hidden />
                                ) : (
                                    <RewardIcon
                                        reward={reward}
                                        className={cn(
                                            'size-4 sm:size-5',
                                            rarityStyle.text,
                                            isLocked && !isChest && 'opacity-60'
                                        )}
                                        aria-hidden
                                    />
                                )}
                                {isLocked && (
                                    <span className="absolute -bottom-0.5 -right-0.5 flex size-4 items-center justify-center rounded-full border border-border bg-card">
                                        <Lock className="size-2.5 text-muted-foreground" aria-hidden />
                                    </span>
                                )}
                            </div>

                            <span
                                className={cn(
                                    'text-[10px] sm:text-xs font-semibold leading-none',
                                    isToday ? 'text-foreground' : 'text-muted-foreground'
                                )}
                            >
                                {t('dailyLogin.day')}{reward.dayNumber}
                            </span>
                            <span
                                className={cn(
                                    'text-[9px] sm:text-[10px] leading-none tabular-nums',
                                    rarity === 'common' ? 'text-muted-foreground' : rarityStyle.text
                                )}
                            >
                                {getRewardShortValue(reward)}
                            </span>
                            <span className="sr-only">
                                {`${name}, ${t(`dailyLogin.dayStatus.${status}`)}`}
                            </span>
                        </li>
                    )
                })}
            </ol>
        </div>
    )
}
