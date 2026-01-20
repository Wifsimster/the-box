import type { AchievementWithProgress } from '@the-box/types'
import { AchievementCard } from './AchievementCard'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

interface AchievementGridProps {
    achievements: AchievementWithProgress[]
    size?: 'small' | 'medium' | 'large'
}

export function AchievementGrid({ achievements, size = 'medium' }: AchievementGridProps) {
    const { t } = useTranslation()

    const sortByDifficulty = (list: AchievementWithProgress[]) => {
        return [...list].sort((a, b) => {
            // First sort by tier (easiest first: 1, 2, 3)
            if (a.tier !== b.tier) {
                return a.tier - b.tier
            }
            // Then by points within same tier (lowest points = easiest)
            return a.points - b.points
        })
    }

    const achievementsByStatus = useMemo(() => {
        const unlocked = achievements.filter(a =>
            a.earned || (a.progressMax != null && a.progress >= a.progressMax)
        )
        const locked = achievements.filter(a =>
            !a.earned && !(a.progressMax != null && a.progress >= a.progressMax)
        )

        return {
            all: sortByDifficulty(achievements),
            unlocked: sortByDifficulty(unlocked),
            locked: sortByDifficulty(locked)
        }
    }, [achievements])

    const filters = ['all', 'unlocked', 'locked'] as const

    const getFilterLabel = (filter: typeof filters[number]) => {
        return t(`achievements.filters.${filter}`)
    }

    const getFilterStats = (filter: typeof filters[number]) => {
        const total = achievementsByStatus[filter].length
        const earned = achievementsByStatus[filter].filter((a: AchievementWithProgress) =>
            a.earned || (a.progressMax != null && a.progress >= a.progressMax)
        ).length
        return { earned, total }
    }

    if (achievements.length === 0) {
        return (
            <div className="text-center py-12 text-muted-foreground">
                {t('achievements.status.noAchievements')}
            </div>
        )
    }

    return (
        <Tabs defaultValue="all" className="w-full">
            <TabsList className="w-full flex-wrap h-auto gap-1">
                {filters.map(filter => {
                    const { earned, total } = getFilterStats(filter)
                    return (
                        <TabsTrigger
                            key={filter}
                            value={filter}
                            className="flex items-center gap-2"
                        >
                            {getFilterLabel(filter)}
                            <span className="text-xs opacity-70">
                                {filter === 'all' ? `${earned}/${total}` : total}
                            </span>
                        </TabsTrigger>
                    )
                })}
            </TabsList>

            {filters.map(filter => (
                <TabsContent key={filter} value={filter} className="mt-6">
                    <div className={`grid gap-4 ${size === 'small'
                        ? 'grid-cols-1 md:grid-cols-2'
                        : 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3'
                        }`}>
                        {achievementsByStatus[filter].map((achievement: AchievementWithProgress) => (
                            <AchievementCard
                                key={achievement.id}
                                achievement={achievement}
                                size={size}
                            />
                        ))}
                    </div>
                </TabsContent>
            ))}
        </Tabs>
    )
}
