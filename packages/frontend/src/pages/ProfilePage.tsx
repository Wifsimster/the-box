import { useEffect, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { motion } from 'framer-motion'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Trophy, Award, TrendingUp, Flame, Calendar } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { useLocalizedPath } from '@/hooks/useLocalizedPath'
import { useAchievementStore } from '@/stores/achievementStore'
import { AchievementGrid } from '@/components/achievement'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Separator } from '@/components/ui/separator'
import { CubeBackground } from '@/components/backgrounds/CubeBackground'
import type { User as UserType } from '@the-box/types'

/**
 * ProfilePage - User profile with achievements and stats
 */
export default function ProfilePage() {
    const { t, i18n } = useTranslation()
    const navigate = useNavigate()
    const { localizedPath } = useLocalizedPath()
    const { session, isPending } = useAuth()
    const [loading, setLoading] = useState(true)
    const [, setError] = useState<string | null>(null)
    const [userProfile, setUserProfile] = useState<UserType | null>(null)
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

    // Fetch achievements and user profile when session is available
    /* eslint-disable react-hooks/set-state-in-effect -- Necessary pattern for data fetching */
    useEffect(() => {
        if (session && !hasFetched.current) {
            hasFetched.current = true
            setError(null)

            Promise.all([
                fetchUserAchievements(),
                fetch('/api/users/me', { credentials: 'include' })
                    .then(res => res.json())
                    .then(json => {
                        if (json.success && json.data) {
                            setUserProfile(json.data)
                        }
                    })
            ])
                .then(() => setError(null))
                .catch((err) => setError(err?.message || 'Failed to load profile data'))
                .finally(() => setLoading(false))
        }
    }, [session, fetchUserAchievements])
    /* eslint-enable react-hooks/set-state-in-effect */

    if (isPending || loading) {
        return (
            <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
                <div className="space-y-4">
                    <Skeleton className="h-32 w-full" />
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                        <Skeleton className="h-32" />
                        <Skeleton className="h-32" />
                        <Skeleton className="h-32" />
                        <Skeleton className="h-32" />
                    </div>
                    <Skeleton className="h-96 w-full" />
                </div>
            </div>
        )
    }

    if (!session) {
        return null
    }

    const earnedCount = stats?.totalEarned || 0
    const totalCount = userAchievements.length
    const completionPercentage = totalCount > 0 ? Math.round((earnedCount / totalCount) * 100) : 0

    const userInitials = (session.user.name || session.user.username || 'U')
        .split(' ')
        .map(n => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2)

    const joinDate = session.user.createdAt
        ? new Date(session.user.createdAt).toLocaleDateString(i18n.language, { month: 'long', year: 'numeric' })
        : t('common.unknown')

    return (
        <>
            <CubeBackground />
            <div className="min-h-screen relative z-10">
                <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">

                    {/* Enhanced User Profile Hero Card */}
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.05 }}
                    >
                        <Card className="border-2 border-primary/20">
                            <CardContent className="pt-8 pb-6">
                                <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6">
                                    <motion.div
                                        initial={{ scale: 0.8, opacity: 0 }}
                                        animate={{ scale: 1, opacity: 1 }}
                                        transition={{ delay: 0.1, type: "spring", stiffness: 200 }}
                                    >
                                        <Avatar className="h-32 w-32 border-4 border-primary/20 shadow-xl">
                                            <AvatarImage
                                                src={(session.user.image !== null ? session.user.image : undefined) || undefined}
                                                alt={(session.user.name !== null ? session.user.name : session.user.username) || 'User'}
                                            />
                                            <AvatarFallback className="text-3xl font-bold bg-linear-to-br from-primary/20 to-primary/5 text-primary">
                                                {userInitials}
                                            </AvatarFallback>
                                        </Avatar>
                                    </motion.div>
                                    <div className="flex-1 space-y-3 text-center sm:text-left">
                                        <div>
                                            <h2 className="text-3xl font-bold bg-linear-to-r from-primary to-primary/60 bg-clip-text text-transparent">
                                                {session.user.name || session.user.username}
                                            </h2>
                                            {session.user.email && (
                                                <p className="text-sm text-muted-foreground mt-1">{session.user.email}</p>
                                            )}
                                        </div>
                                        <div className="flex flex-wrap items-center justify-center sm:justify-start gap-4 text-sm text-muted-foreground">
                                            <div className="flex items-center gap-2">
                                                <Calendar className="h-4 w-4" />
                                                <span>{t('profile.joined')} {joinDate}</span>
                                            </div>
                                            {!session.user.emailVerified && (
                                                <Badge variant="outline" className="text-xs">
                                                    {t('common.guestBadge')}
                                                </Badge>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    </motion.div>

                    <Separator />

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
                                        <Trophy className="h-5 w-5 text-(--color-warning)" />
                                        <Badge variant="secondary" className="text-xs">
                                            {t('profile.total')}
                                        </Badge>
                                    </div>
                                </CardHeader>
                                <CardContent>
                                    <div className="text-3xl font-bold">{userProfile?.totalScore?.toLocaleString() || 0}</div>
                                    <CardDescription className="text-xs mt-1">{t('profile.totalScore')}</CardDescription>
                                    {(!userProfile?.totalScore || userProfile.totalScore === 0) && (
                                        <div className="mt-3 pt-3 border-t border-border/50">
                                            <p className="text-xs text-muted-foreground italic">
                                                {t('profile.emptyState.totalScore')}
                                            </p>
                                        </div>
                                    )}
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
                                    <div className="text-3xl font-bold">{userProfile?.currentStreak || 0}</div>
                                    <CardDescription className="text-xs mt-1">{t('profile.currentStreak')}</CardDescription>
                                    {(!userProfile?.currentStreak || userProfile.currentStreak === 0) && (
                                        <div className="mt-3 pt-3 border-t border-border/50">
                                            <p className="text-xs text-muted-foreground italic">
                                                {t('profile.emptyState.currentStreak')}
                                            </p>
                                        </div>
                                    )}
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
                                        <Award className="h-5 w-5 text-primary" />
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
                                    {earnedCount === 0 && (
                                        <div className="mt-3 pt-3 border-t border-border/50">
                                            <p className="text-xs text-muted-foreground italic">
                                                {t('profile.emptyState.achievements')}
                                            </p>
                                        </div>
                                    )}
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
                                        <TrendingUp className="h-5 w-5 text-(--color-success)" />
                                        <Badge variant="secondary" className="text-xs">
                                            {t('profile.points')}
                                        </Badge>
                                    </div>
                                </CardHeader>
                                <CardContent>
                                    <div className="text-3xl font-bold">{stats?.totalPoints || 0}</div>
                                    <CardDescription className="text-xs mt-1">{t('profile.achievementPoints')}</CardDescription>
                                    {(!stats?.totalPoints || stats.totalPoints === 0) && (
                                        <div className="mt-3 pt-3 border-t border-border/50">
                                            <p className="text-xs text-muted-foreground italic">
                                                {t('profile.emptyState.achievementPoints')}
                                            </p>
                                        </div>
                                    )}
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
                                    {t('profile.title')} ({totalCount})
                                </CardTitle>
                                <CardDescription>
                                    {t('profile.description')}
                                </CardDescription>
                            </CardHeader>
                            <CardContent>
                                {isLoadingUserAchievements ? (
                                    <div className="space-y-4">
                                        <div className="flex gap-2">
                                            <Skeleton className="h-10 w-24" />
                                            <Skeleton className="h-10 w-24" />
                                            <Skeleton className="h-10 w-24" />
                                        </div>
                                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                                            <Skeleton className="h-48" />
                                            <Skeleton className="h-48" />
                                            <Skeleton className="h-48" />
                                            <Skeleton className="h-48" />
                                            <Skeleton className="h-48" />
                                            <Skeleton className="h-48" />
                                        </div>
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
                                        {Object.entries(stats.byCategory).map(([category, count]: [string, number]) => (
                                            <div key={category} className="text-center">
                                                <div className="text-2xl font-bold">{count as number}</div>
                                                <div className="text-xs text-muted-foreground capitalize">{category}</div>
                                            </div>
                                        ))}
                                    </div>
                                </CardContent>
                            </Card>
                        </motion.div>
                    )}
                </div>
            </div>
        </>
    )
}
