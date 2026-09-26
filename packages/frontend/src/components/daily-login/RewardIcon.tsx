import { Coins, Gamepad2, Gift, ShieldCheck, Snowflake, Type } from 'lucide-react'
import type { LucideProps } from 'lucide-react'
import type { DailyReward } from '@the-box/types'

interface RewardIconProps extends LucideProps {
    reward: Pick<DailyReward, 'rewardType' | 'rewardValue'>
}

/**
 * One Lucide icon per reward kind, shared by the claim modal and the weekly
 * track so both surfaces speak the same visual language (the DB `iconUrl`
 * emojis render inconsistently across platforms). Legacy metadata-hint keys
 * (retired 2026-06) fall through to the generic icon.
 */
export function RewardIcon({ reward, ...props }: RewardIconProps) {
    if (reward.rewardType === 'legendary') return <Gift {...props} />
    if (reward.rewardType === 'points') return <Coins {...props} />
    switch (reward.rewardValue.items[0]?.key) {
        case 'hint_letter':
            return <Type {...props} />
        case 'streak_freeze':
            return <Snowflake {...props} />
        case 'second_chance':
            return <ShieldCheck {...props} />
        default:
            return <Gamepad2 {...props} />
    }
}

/** Short value shown under a day on the weekly track ("+100", "2×"). */
export function getRewardShortValue(reward: Pick<DailyReward, 'rewardValue'>): string {
    if (reward.rewardValue.points > 0) return `+${reward.rewardValue.points}`
    const quantity = reward.rewardValue.items.reduce((acc, item) => acc + item.quantity, 0)
    return `${quantity}×`
}
