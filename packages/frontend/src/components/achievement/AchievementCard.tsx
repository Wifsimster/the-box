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

const tierColors = {
    1: 'bg-amber-600/10 border-amber-600/30 text-amber-400',
    2: 'bg-purple-600/10 border-purple-600/30 text-purple-400',
    3: 'bg-cyan-600/10 border-cyan-600/30 text-cyan-400',
}

export function AchievementCard({ achievement, size = 'medium', className }: AchievementCardProps) {
    const { t, i18n } = useTranslation()
    const isEarned = achievement.earned
    const isLocked = achievement.isHidden && !isEarned
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

    if (size === 'small') {
        return (
            <div
                className={cn(
                    'relative flex items-center gap-3 rounded-lg border p-3 transition-all',
                    isEarned
                        ? 'border-primary/30 bg-primary/5'
                        : 'border-muted/30 bg-muted/5 opacity-60',
                    className
                )}
            >
                <div className="text-3xl">{isLocked ? <Lock className="w-8 h-8" /> : achievement.iconUrl}</div>
                <div className="flex-1 min-w-0">
                    <div className="font-semibold text-sm truncate">
                        {isLocked ? '???' : achievement.name}
                    </div>
                    <div className="text-xs text-muted-foreground truncate">
                        {isLocked ? t('achievements.status.hidden') : achievement.description}
                    </div>
                    {hasProgress && !isEarned && (
                        <Progress value={(achievement.progress / achievement.progressMax!) * 100} className="mt-1 h-1" />
                    )}
                </div>
                <div className="flex flex-col items-end gap-1">
                    <Badge variant="outline" className={cn('text-xs', tierColor)}>
                        {achievement.points}pts
                    </Badge>
                </div>
            </div>
        )
    }

    return (
        <Card
            className={cn(
                'relative overflow-hidden transition-all',
                isEarned
                    ? 'border-primary/30 bg-primary/5 hover:border-primary/50'
                    : 'border-muted/30 bg-muted/5 opacity-70 hover:opacity-85',
                className
            )}
        >
            {isEarned && (
                <div className="absolute top-2 right-2">
                    <Badge variant="success" className="text-xs">
                        ✓ {t('achievements.status.earned')}
                    </Badge>
                </div>
            )}

            <CardHeader className="pb-3">
                <div className="flex items-start gap-3">
                    <div className={cn(
                        'text-4xl p-2 rounded-lg',
                        isEarned ? 'bg-primary/10' : 'bg-muted/20'
                    )}>
                        {isLocked ? <Lock className="w-10 h-10" /> : achievement.iconUrl}
                    </div>
                    <div className="flex-1 min-w-0">
                        <CardTitle className="text-lg">
                            {isLocked ? '???' : achievement.name}
                        </CardTitle>
                        <CardDescription className="mt-1">
                            {isLocked ? t('achievements.status.hiddenDescription') : achievement.description}
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

                {hasProgress && !isEarned && (
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
