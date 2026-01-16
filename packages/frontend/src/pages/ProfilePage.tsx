import { useEffect, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { motion } from 'framer-motion'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { User, Trophy, Award, TrendingUp, Flame, Loader2 } from 'lucide-react'
import { PageHero } from '@/components/layout/PageHero'
import { useAuth } from '@/hooks/useAuth'
import { useLocalizedPath } from '@/hooks/useLocalizedPath'
import { useAchievementStore } from '@/stores/achievementStore'
import { AchievementGrid } from '@/components/achievement'
import { Badge } from '@/components/ui/badge'

/**
 * ProfilePage - User profile with achievements and stats
 */
export default function ProfilePage() {
    const { t } = useTranslation()
    const navigate = useNavigate()
    const { localizedPath } = useLocalizedPath()
    const { session, isPending } = useAuth()
    const [loading, setLoading] = useState(true)
    const hasFetched = useRef(false)

    const {
        userAchievements,
        stats,
        fetchUserAchievements,
        isLoadingUserAchievements
    } = useAchievementStore()

    // Redirect to login if not authenticated
    useEffect(() => {
        if (!isPending && !session) {
            navigate(localizedPath('/login'))
        }
    }, [isPending, session, navigate, localizedPath])

    // Fetch achievements when session is available
    useEffect(() => {
        if (session && !hasFetched.current) {
            hasFetched.current = true
            fetchUserAchievements()
                .finally(() => setLoading(false))
        }
    }, [session, fetchUserAchievements])

    if (isPending || loading) {
        return (
            <div className="flex justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
        )
    }

    if (!session) {
        return null
    }

    const earnedCount = stats?.totalEarned || 0
    const totalCount = userAchievements.length
    const completionPercentage = totalCount > 0 ? Math.round((earnedCount / totalCount) * 100) : 0

    return (
        <PageHero icon={User} iconStyle="simple" title={session.user.name || session.user.username || 'User'}>
            <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">

                {/* Profile Stats */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.1 }}
                    >
                        <Card>
                            <CardHeader className="pb-3">
                                <div className="flex items-center justify-between">
                                    <Trophy className="h-5 w-5 text-yellow-500" />
                                    <Badge variant="secondary" className="text-xs">
                                        {t('profile.total')}
                                    </Badge>
                                </div>
                            </CardHeader>
                            <CardContent>
                                <div className="text-3xl font-bold">{session.user.totalScore}</div>
                                <CardDescription className="text-xs mt-1">{t('profile.totalScore')}</CardDescription>
                            </CardContent>
                        </Card>
                    </motion.div>

                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.2 }}
                    >
                        <Card>
                            <CardHeader className="pb-3">
                                <div className="flex items-center justify-between">
                                    <Flame className="h-5 w-5 text-orange-500" />
                                    <Badge variant="secondary" className="text-xs">
                                        {t('profile.days')}
                                    </Badge>
                                </div>
                            </CardHeader>
                            <CardContent>
                                <div className="text-3xl font-bold">{session.user.currentStreak}</div>
                                <CardDescription className="text-xs mt-1">{t('profile.currentStreak')}</CardDescription>
                            </CardContent>
                        </Card>
                    </motion.div>

                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.3 }}
                    >
                        <Card>
                            <CardHeader className="pb-3">
                                <div className="flex items-center justify-between">
                                    <Award className="h-5 w-5 text-purple-500" />
                                    <Badge variant="secondary" className="text-xs">
                                        {t('profile.unlocked')}
                                    </Badge>
                                </div>
                            </CardHeader>
                            <CardContent>
                                <div className="text-3xl font-bold">{earnedCount}</div>
                                <CardDescription className="text-xs mt-1">
                                    {t('profile.achievements')} ({completionPercentage}%)
                                </CardDescription>
                            </CardContent>
                        </Card>
                    </motion.div>

                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.4 }}
                    >
                        <Card>
                            <CardHeader className="pb-3">
                                <div className="flex items-center justify-between">
                                    <TrendingUp className="h-5 w-5 text-green-500" />
                                    <Badge variant="secondary" className="text-xs">
                                        {t('profile.points')}
                                    </Badge>
                                </div>
                            </CardHeader>
                            <CardContent>
                                <div className="text-3xl font-bold">{stats?.totalPoints || 0}</div>
                                <CardDescription className="text-xs mt-1">{t('profile.achievementPoints')}</CardDescription>
                            </CardContent>
                        </Card>
                    </motion.div>
                </div>

                {/* Achievements Section */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.5 }}
                >
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <Trophy className="h-5 w-5" />
                                {t('profile.title')}
                            </CardTitle>
                            <CardDescription>
                                {t('profile.description')}
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            {isLoadingUserAchievements ? (
                                <div className="flex justify-center py-12">
                                    <Loader2 className="w-8 h-8 animate-spin text-primary" />
                                </div>
                            ) : (
                                <AchievementGrid achievements={userAchievements} />
                            )}
                        </CardContent>
                    </Card>
                </motion.div>

                {/* Achievement Stats by Category */}
                {stats && Object.keys(stats.byCategory).length > 0 && (
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.6 }}
                    >
                        <Card>
                            <CardHeader>
                                <CardTitle>{t('profile.progressByCategory')}</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                                    {Object.entries(stats.byCategory).map(([category, count]) => (
                                        <div key={category} className="text-center">
                                            <div className="text-2xl font-bold">{count}</div>
                                            <div className="text-xs text-muted-foreground capitalize">{category}</div>
                                        </div>
                                    ))}
                                </div>
                            </CardContent>
                        </Card>
                    </motion.div>
                )}
            </div>
        </PageHero>
    )
}
