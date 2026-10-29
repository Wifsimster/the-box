import type { DailyReward, RewardRarity } from '@the-box/types'

export const RARITY_ORDER: readonly RewardRarity[] = [
    'common',
    'uncommon',
    'rare',
    'epic',
    'legendary',
]

export interface RarityStyle {
    labelKey: string
    cell: string
    ring: string
    text: string
    border: string
    gradient: string
    badge: string
    sparkle: string
    glow: string
}

export const RARITY_STYLES: Record<RewardRarity, RarityStyle> = {
    common: {
        labelKey: 'dailyLogin.rarity.common',
        cell: 'bg-muted/30 border-muted-foreground/30',
        ring: 'ring-muted-foreground',
        text: 'text-muted-foreground',
        border: 'border-muted-foreground/30',
        gradient: 'from-muted/20 to-transparent',
        badge: 'bg-muted/40 text-muted-foreground',
        sparkle: 'text-muted-foreground',
        glow: '0 0 8px color-mix(in srgb, var(--muted-foreground) 45%, transparent)',
    },
    uncommon: {
        labelKey: 'dailyLogin.rarity.uncommon',
        cell: 'bg-success/10 border-success/40',
        ring: 'ring-success',
        text: 'text-success',
        border: 'border-success/40',
        gradient: 'from-success/10 to-transparent',
        badge: 'bg-success/20 text-success',
        sparkle: 'text-success',
        glow: '0 0 10px color-mix(in srgb, var(--success) 50%, transparent)',
    },
    rare: {
        labelKey: 'dailyLogin.rarity.rare',
        cell: 'bg-neon-blue/10 border-neon-blue/40',
        ring: 'ring-neon-blue',
        text: 'text-neon-blue',
        border: 'border-neon-blue/40',
        gradient: 'from-neon-blue/15 to-transparent',
        badge: 'bg-neon-blue/20 text-neon-blue',
        sparkle: 'text-neon-blue',
        glow: '0 0 14px color-mix(in srgb, var(--neon-blue) 55%, transparent)',
    },
    epic: {
        labelKey: 'dailyLogin.rarity.epic',
        cell: 'bg-neon-purple/10 border-neon-purple/50',
        ring: 'ring-neon-purple',
        text: 'text-neon-purple',
        border: 'border-neon-purple/50',
        gradient: 'from-neon-purple/20 to-transparent',
        badge: 'bg-neon-purple/20 text-neon-purple',
        sparkle: 'text-neon-purple',
        glow: '0 0 18px color-mix(in srgb, var(--neon-purple) 60%, transparent)',
    },
    legendary: {
        labelKey: 'dailyLogin.rarity.legendary',
        cell: 'bg-warning/10 border-warning/50',
        ring: 'ring-warning',
        text: 'text-warning',
        border: 'border-warning/50',
        gradient: 'from-warning/20 to-transparent',
        badge: 'bg-warning/20 text-warning',
        sparkle: 'text-warning',
        glow: '0 0 24px color-mix(in srgb, var(--warning) 70%, transparent)',
    },
}

export const RARITY_CLAIM_ANIMATION: Record<RewardRarity, string> = {
    common: 'rarity-reveal-soft',
    uncommon: 'rarity-reveal-soft',
    rare: 'rarity-reveal-glow',
    epic: 'rarity-reveal-glow',
    legendary: 'rarity-reveal-burst',
}

export function getRewardRarity(reward: Pick<DailyReward, 'rarity' | 'rewardType'>): RewardRarity {
    if (reward.rarity && RARITY_ORDER.includes(reward.rarity)) {
        return reward.rarity
    }
    if (reward.rewardType === 'legendary') return 'legendary'
    return 'common'
}

export function getRarityStyle(reward: Pick<DailyReward, 'rarity' | 'rewardType'>): RarityStyle {
    return RARITY_STYLES[getRewardRarity(reward)]
}
