import { useTranslation } from 'react-i18next'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Trophy, TrendingUp, Flame, Target } from 'lucide-react'
import { useGameStore } from '@/stores/gameStore'

export function PersonalBestsCard() {
    const { t } = useTranslation()
    const { personalBests } = useGameStore()

    const stats = [
        {
            icon: Trophy,
            label: t('personalBests.highestScore'),
            value: personalBests.highestScore,
            color: 'text-warning',
            bgColor: 'bg-warning/10',
        },
        {
            icon: Target,
            label: t('personalBests.bestRank'),
            value: personalBests.bestPercentile < 100
                ? `Top ${personalBests.bestPercentile}%`
                : t('personalBests.noRankYet'),
            color: 'text-neon-blue',
            bgColor: 'bg-neon-blue/10',
        },
        {
            icon: Flame,
            label: t('personalBests.currentStreak'),
            value: personalBests.currentStreak > 0
                ? `${personalBests.currentStreak} ${t('personalBests.days')}`
                : t('personalBests.noStreakYet'),
            color: 'text-score-low',
            bgColor: 'bg-score-low/10',
        },
        {
            icon: TrendingUp,
            label: t('personalBests.longestStreak'),
            value: personalBests.longestStreak > 0
                ? `${personalBests.longestStreak} ${t('personalBests.days')}`
                : t('personalBests.noStreakYet'),
            color: 'text-success',
            bgColor: 'bg-success/10',
        },
    ]

    // Don't show the card if no stats yet
    if (personalBests.highestScore === 0 && personalBests.longestStreak === 0) {
        return null
    }

    return (
        <Card className="bg-card/50 border-border">
            <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                    <Trophy className="size-5 text-warning" />
                    {t('personalBests.title')}
                </CardTitle>
            </CardHeader>
            <CardContent>
                <div className="grid grid-cols-2 gap-3 sm:gap-4">
                    {stats.map((stat, index) => {
                        const Icon = stat.icon
                        return (
                            <div
                                key={index}
                                className={`flex flex-col items-center justify-center p-3 sm:p-4 rounded-lg ${stat.bgColor}`}
                            >
                                <Icon className={`size-6 sm:size-8 mb-2 ${stat.color}`} />
                                <div className="text-center">
                                    <div className="text-lg sm:text-2xl font-bold">
                                        {typeof stat.value === 'number' && stat.value > 0 ? (
                                            stat.value
                                        ) : (
                                            <span className="text-sm sm:text-base">{stat.value}</span>
                                        )}
                                    </div>
                                    <div className="text-xs sm:text-sm text-muted-foreground mt-1">
                                        {stat.label}
                                    </div>
                                </div>
                            </div>
                        )
                    })}
                </div>
            </CardContent>
        </Card>
    )
}
