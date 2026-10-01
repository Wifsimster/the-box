import type { NewlyEarnedAchievement } from '@the-box/types'
import { m } from 'framer-motion'
import { toast as sonner } from 'sonner'
import { useTranslation } from 'react-i18next'
import { Card, CardDescription, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Trophy, X } from 'lucide-react'

interface AchievementToastBodyProps {
    achievement: NewlyEarnedAchievement
    toastId: string | number
}

// Tier gradients map to semantic tokens; see AchievementCard for the palette rationale.
const tierColors = {
    1: 'from-warning/20 to-warning/5 border-warning/50',
    2: 'from-primary/20 to-primary/5 border-primary/50',
    3: 'from-neon-cyan/20 to-neon-cyan/5 border-neon-cyan/50',
}

/**
 * Visual body for the achievement-unlocked sonner toast. Exported for
 * reuse inside `sonner.toast.custom(...)` — see `showAchievementToast`.
 */
export function AchievementToastBody({ achievement, toastId }: AchievementToastBodyProps) {
    const { t } = useTranslation()
    const tierGradient = tierColors[achievement.tier as keyof typeof tierColors] || tierColors[1]
    const localizedName = t(`achievements.items.${achievement.key}.name`, {
        defaultValue: achievement.name,
    })
    const localizedDescription = t(`achievements.items.${achievement.key}.description`, {
        defaultValue: achievement.description,
    })

    return (
        <Card className={`relative w-full max-w-sm overflow-hidden border-2 bg-card bg-linear-to-br ${tierGradient} shadow-2xl`}>
            <div className="flex items-center gap-3 py-3 pl-3 pr-1">
                <m.div
                    className="text-3xl leading-none shrink-0"
                    initial={{ scale: 0.6, rotate: -10 }}
                    animate={{ scale: 1, rotate: 0 }}
                    transition={{ type: 'spring', stiffness: 400, damping: 14 }}
                    aria-hidden="true"
                >
                    {achievement.iconUrl || '🏆'}
                </m.div>
                <div className="flex-1 min-w-0">
                    <p className="flex items-center gap-1 text-xs font-semibold text-warning">
                        <Trophy className="size-3.5 shrink-0" aria-hidden="true" />
                        {t('achievements.unlocked')}
                    </p>
                    <CardTitle className="mt-1 text-base leading-tight truncate">{localizedName}</CardTitle>
                    <CardDescription className="mt-0.5 text-xs line-clamp-1">
                        {localizedDescription}
                    </CardDescription>
                </div>
                <Badge variant="secondary" className="shrink-0 text-xs tabular-nums">
                    +{achievement.points}
                    <span className="sr-only"> {t('dailyLogin.points')}</span>
                </Badge>
                <Button
                    variant="ghost"
                    size="icon"
                    className="shrink-0 rounded-full text-muted-foreground"
                    onClick={() => sonner.dismiss(toastId)}
                    aria-label={t('common.close')}
                >
                    <X className="size-4" aria-hidden="true" />
                </Button>
            </div>
        </Card>
    )
}

