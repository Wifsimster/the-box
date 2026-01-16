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

    const categories = useMemo(() => {
        const cats = new Set(achievements.map(a => a.category))
        return ['all', ...Array.from(cats).sort()]
    }, [achievements])

    const achievementsByCategory = useMemo(() => {
        return categories.reduce((acc, category) => {
            if (category === 'all') {
                acc[category] = achievements
            } else {
                acc[category] = achievements.filter(a => a.category === category)
            }
            return acc
        }, {} as Record<string, AchievementWithProgress[]>)
    }, [achievements, categories])

    const getCategoryLabel = (category: string) => {
        return t(`achievements.categories.${category}`)
    }

    const getCategoryStats = (category: string) => {
        const categoryAchievements = achievementsByCategory[category] || []
        const earned = categoryAchievements.filter(a => a.earned).length
        const total = categoryAchievements.length
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
                {categories.map(category => {
                    const { earned, total } = getCategoryStats(category)
                    return (
                        <TabsTrigger
                            key={category}
                            value={category}
                            className="flex items-center gap-2"
                        >
                            {getCategoryLabel(category)}
                            <span className="text-xs opacity-70">
                                {earned}/{total}
                            </span>
                        </TabsTrigger>
                    )
                })}
            </TabsList>

            {categories.map(category => (
                <TabsContent key={category} value={category} className="mt-6">
                    <div className={`grid gap-4 ${size === 'small'
                        ? 'grid-cols-1 md:grid-cols-2'
                        : 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3'
                        }`}>
                        {(achievementsByCategory[category] || []).map(achievement => (
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
