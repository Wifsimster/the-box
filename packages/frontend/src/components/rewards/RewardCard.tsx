import { useTranslation } from 'react-i18next'
import { motion } from 'framer-motion'
import {
    Crown,
    Gift,
    Palette,
    RotateCcw,
    Snowflake,
    Trophy,
    Wand2,
} from 'lucide-react'
import type { RewardGrant, RewardSource } from '@the-box/types'
import { Button } from '@/components/ui/button'
import { useRewardsStore } from '@/stores/rewardsStore'
import { cn } from '@/lib/utils'

const SOURCE_ICON: Record<RewardSource, typeof Gift> = {
    reactivation: RotateCcw,
    milestone: Trophy,
    streak_freeze: Snowflake,
    leaderboard_payout: Crown,
    cosmetic_unlock: Palette,
    powerup_drop: Wand2,
    daily_login: Gift,
}

const SOURCE_ACCENT: Record<RewardSource, string> = {
    reactivation: 'text-neon-purple',
    milestone: 'text-warning',
    streak_freeze: 'text-neon-blue',
    leaderboard_payout: 'text-warning',
    cosmetic_unlock: 'text-neon-pink',
    powerup_drop: 'text-neon-purple',
    daily_login: 'text-primary',
}

interface RewardCardProps {
    grant: RewardGrant
}

export function RewardCard({ grant }: RewardCardProps) {
    const { t } = useTranslation()
    const claim = useRewardsStore((s) => s.claim)
    const claiming = useRewardsStore((s) => s.claiming[grant.id] ?? false)

    const Icon = SOURCE_ICON[grant.source]
    const accent = SOURCE_ACCENT[grant.source]

    const isUnlocked = grant.unlockedAt !== null
    const titleKey = `rewards.sources.${grant.source}.title`
    const subtitleKey = isUnlocked
        ? `rewards.sources.${grant.source}.ready`
        : `rewards.sources.${grant.source}.pending`

    return (
        <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96 }}
            transition={{ duration: 0.2 }}
            className="rounded-lg border border-border/40 bg-card/60 p-4 backdrop-blur-sm"
        >
            <div className="flex items-start gap-3">
                <div className={cn('flex size-10 items-center justify-center rounded-md bg-background/50', accent)}>
                    <Icon className="size-5" />
                </div>
                <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground">
                        {t(titleKey, { defaultValue: grant.source })}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                        {t(subtitleKey, { defaultValue: '' })}
                    </p>
                    {grant.payload.items.length > 0 && (
                        <ul className="mt-2 flex flex-wrap gap-1.5">
                            {grant.payload.items.map((item, i) => (
                                <li
                                    key={`${item.itemKey}-${i}`}
                                    className="rounded-full border border-border/40 bg-background/50 px-2 py-0.5 text-[11px] text-muted-foreground"
                                >
                                    {t(`rewards.items.${item.itemKey}`, {
                                        defaultValue: item.itemKey,
                                    })}
                                    {item.quantity > 1 ? ` × ${item.quantity}` : ''}
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            </div>
            <div className="mt-3 flex justify-end">
                <Button
                    size="sm"
                    variant={isUnlocked ? 'gaming' : 'outline'}
                    disabled={!isUnlocked || claiming}
                    onClick={() => {
                        if (!isUnlocked) return
                        void claim(grant.id)
                    }}
                >
                    {claiming
                        ? t('rewards.claiming')
                        : isUnlocked
                            ? t('rewards.claim')
                            : t('rewards.locked')}
                </Button>
            </div>
        </motion.div>
    )
}
