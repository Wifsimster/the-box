import type { DailyReward, RewardRarity } from '@the-box/types'

/**
 * Visual mapping for daily-login reward rarities. Centralised here so the
 * calendar, the claim modal and any future surface share one source of
 * truth for colours, labels and animations.
 *
 * IMPORTANT: every Tailwind class below is written as a complete literal
 * string (never composed at runtime), so the Tailwind v4 scanner can see
 * and emit them. Do not build these class names dynamically.
 */

export const RARITY_ORDER: readonly RewardRarity[] = [
    'common',
    'uncommon',
    'rare',
    'epic',
    'legendary',
]

export interface RarityStyle {
    /** i18n key for the human-readable rarity label. */
    labelKey: string
    /** Calendar cell tint (background + border) when the day is active/locked. */
    cell: string
    /** Ring colour used to highlight "today" in the calendar. */
    ring: string
    /** Text/icon accent colour. */
    text: string
    /** Border colour for the modal reward card + badges. */
    border: string
    /** Soft gradient backdrop for the modal reward card. */
    gradient: string
    /** Badge classes (bg + text) shown in the modal. */
    badge: string
    /** Sparkle / accent colour for the claim celebration. */
    sparkle: string
    /**
     * Inline box-shadow used for the rarity "glow". Kept as a raw CSS value
     * (consumed via `style`) so we can lean on the theme CSS variables and
     * vary intensity per tier without bloating the Tailwind safelist.
     */
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

/**
 * CSS keyframe animation name (defined in index.css) used for the unlock
 * celebration, escalating with rarity. `prefers-reduced-motion` zeroes
 * these out at the stylesheet level.
 */
export const RARITY_CLAIM_ANIMATION: Record<RewardRarity, string> = {
    common: 'rarity-reveal-soft',
    uncommon: 'rarity-reveal-soft',
    rare: 'rarity-reveal-glow',
    epic: 'rarity-reveal-glow',
    legendary: 'rarity-reveal-burst',
}

/**
 * Resolve a reward's rarity, falling back to a sensible derived value for
 * historical rewards that predate the `rarity` column.
 */
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
