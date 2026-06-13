import type { AchievementWithProgress } from '@the-box/types'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Lock } from 'lucide-react'
import { useTranslation } from 'react-i18next'

interface AchievementCardProps {
    achievement: AchievementWithProgress
    size?: 'small' | 'medium' | 'large'
    className?: string
}

// Tier colors map to semantic tokens: easy=warning (amber), medium=primary (violet), hard=neon-cyan
const tierColors = {
    1: 'bg-warning/10 border-warning/30 text-warning',
    2: 'bg-primary/10 border-primary/30 text-primary',
    3: 'bg-neon-cyan/10 border-neon-cyan/30 text-neon-cyan',
}

export function AchievementCard({ achievement, size = 'medium', className }: AchievementCardProps) {
    const { t, i18n } = useTranslation()
    const isEarned = achievement.earned
    const isLocked = achievement.isHidden && !isEarned

    // Check if achievement should be considered complete based on progress
    const isComplete = isEarned || (
        achievement.progressMax != null &&
        achievement.progress >= achievement.progressMax
    )

    // Show progress bar for any achievement with a progressMax, even if progress is 0
    const hasProgress = achievement.progressMax != null && achievement.progressMax > 0

    const tierColor = tierColors[achievement.tier as keyof typeof tierColors] || tierColors[1]

    const getTierLabel = (tier: number) => {
        const tierKey = tier === 1 ? 'easy' : tier === 2 ? 'medium' : 'hard'
        return t(`achievements.difficulty.${tierKey}`)
    }

    const getCategoryLabel = (category: string) => {
        return t(`achievements.categories.${category}`)
    }

    const lockedLabel = t('achievements.status.locked')
    const earnedLabel = t('achievements.status.earned')
    const localizedName = t(`achievements.items.${achievement.key}.name`, {
        defaultValue: achievement.name,
    })
    const localizedDescription = t(`achievements.items.${achievement.key}.description`, {
        defaultValue: achievement.description,
    })
    // A non-color status hint that screen readers can use ("locked" /
    // "earned"). We render the same cue visually as a Lock icon so users
    // who can't perceive the purple-vs-grey delta still get the signal.
    const statusAriaLabel = isComplete ? earnedLabel : lockedLabel

    if (size === 'small') {
        return (
            <div
                aria-label={statusAriaLabel}
                className={cn(
                    'relative flex items-center gap-3 rounded-lg border p-3 transition-all',
                    isComplete
                        ? 'border-primary/40 bg-primary/10 shadow-sm'
                        : 'border-muted/30 bg-muted/5 opacity-80',
                    className
                )}
            >
                <div className="text-3xl">{isLocked ? <Lock className="size-8" aria-hidden="true" /> : achievement.iconUrl}</div>
                <div className="flex-1 min-w-0">
                    <div className="font-semibold text-sm truncate">
                        {isLocked ? '???' : localizedName}
                    </div>
                    <div className="text-xs text-muted-foreground truncate">
                        {isLocked ? t('achievements.status.hidden') : localizedDescription}
                    </div>
                    {hasProgress && !isComplete && (
                        <Progress
                            value={(achievement.progress / achievement.progressMax!) * 100}
                            aria-label={`${t('achievements.status.progress')}: ${achievement.progress} / ${achievement.progressMax}`}
                            className="mt-1 h-1"
                        />
                    )}
                </div>
                <div className="flex flex-col items-end gap-1">
                    <Badge variant="outline" className={cn('text-xs', tierColor)}>
                        {achievement.points}pts
                    </Badge>
                    {isComplete && !isEarned && (
                        <Badge variant="success" className="text-xs">
                            ✓
                        </Badge>
                    )}
                    {!isComplete && !isLocked && (
                        <Lock className="size-3.5 text-muted-foreground" aria-hidden="true" />
                    )}
                </div>
            </div>
        )
    }

    return (
        <Card
            aria-label={statusAriaLabel}
            className={cn(
                'relative overflow-hidden transition-all',
                isComplete
                    ? 'border-primary/40 bg-primary/10 hover:border-primary/60 shadow-sm'
                    : 'border-muted/30 bg-muted/5 opacity-85 hover:opacity-100',
                className
            )}
        >
            {isComplete ? (
                <div className="absolute top-2 right-2">
                    <Badge variant="success" className="text-xs flex items-center gap-1">
                        ✓ {earnedLabel}
                    </Badge>
                </div>
            ) : (
                <div className="absolute top-2 right-2">
                    <Badge
                        variant="outline"
                        className="text-xs flex items-center gap-1 border-muted-foreground/40 text-muted-foreground"
                    >
                        <Lock className="size-3" aria-hidden="true" />
                        {lockedLabel}
                    </Badge>
                </div>
            )}

            <CardHeader className="pb-3">
                <div className="flex items-start gap-3">
                    <div className={cn(
                        'text-4xl p-2 rounded-lg',
                        isComplete ? 'bg-primary/20 ring-2 ring-primary/30' : 'bg-muted/20'
                    )}>
                        {isLocked ? <Lock className="size-10" aria-hidden="true" /> : achievement.iconUrl}
                    </div>
                    <div className="flex-1 min-w-0">
                        <CardTitle className="text-lg">
                            {isLocked ? '???' : localizedName}
                        </CardTitle>
                        <CardDescription className="mt-1">
                            {isLocked ? t('achievements.status.hiddenDescription') : localizedDescription}
                        </CardDescription>
                    </div>
                </div>
            </CardHeader>

            <CardContent className="pt-0">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2">
                        <Badge variant="outline" className={cn('text-xs', tierColor)}>
                            {getTierLabel(achievement.tier)} • {achievement.points}pts
                        </Badge>
                        <Badge variant="outline" className="text-xs capitalize">
                            {getCategoryLabel(achievement.category)}
                        </Badge>
                    </div>

                    {isEarned && achievement.earnedAt && (
                        <div className="text-xs text-muted-foreground">
                            {new Date(achievement.earnedAt).toLocaleDateString(i18n.language, { year: 'numeric', month: 'short', day: 'numeric' })}
                        </div>
                    )}
                </div>

                {hasProgress && !isComplete && (
                    <div className="mt-3 space-y-1">
                        <div className="flex justify-between text-xs text-muted-foreground">
                            <span>{t('achievements.status.progress')}</span>
                            <span>{achievement.progress} / {achievement.progressMax}</span>
                        </div>
                        <Progress value={(achievement.progress / achievement.progressMax!) * 100} />
                    </div>
                )}
            </CardContent>
        </Card>
    )
}
