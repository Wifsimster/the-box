import { Coins, Gamepad2, Gift, ShieldCheck, Snowflake, Type } from 'lucide-react'
import type { LucideProps } from 'lucide-react'
import type { DailyReward } from '@the-box/types'

interface RewardIconProps extends LucideProps {
    reward: Pick<DailyReward, 'rewardType' | 'rewardValue'>
}

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

export function getRewardShortValue(reward: Pick<DailyReward, 'rewardValue'>): string {
    if (reward.rewardValue.points > 0) return `+${reward.rewardValue.points}`
    const quantity = reward.rewardValue.items.reduce((acc, item) => acc + item.quantity, 0)
    return `${quantity}×`
}
