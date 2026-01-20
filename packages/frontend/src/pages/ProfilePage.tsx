import { useEffect, useState, useRef, useCallback } from 'react'
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
import { Separator } from '@/components/ui/separator'
import { CubeBackground } from '@/components/backgrounds/CubeBackground'
import { AvatarUpload } from '@/components/profile'
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
    const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
    const hasFetched = useRef(false)

    const {
        userAchievements,
        stats,
        fetchUserAchievements,
        isLoadingUserAchievements
    } = useAchievementStore()

    const handleAvatarChange = useCallback((newAvatarUrl: string | null) => {
        setAvatarUrl(newAvatarUrl)
    }, [])

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
                fetch('/api/user/me', { credentials: 'include' })
                    .then(res => res.json())
                    .then(json => {
                        if (json.success && json.data) {
                            setUserProfile(json.data)
                            setAvatarUrl(json.data.avatarUrl ?? session.user.image ?? null)
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

    // Count achievements as earned if marked as earned OR if progress >= progressMax
    const earnedCount = userAchievements.filter(a =>
        a.earned || (a.progressMax != null && a.progress >= a.progressMax)
    ).length
    const totalCount = userAchievements.length
    const completionPercentage = totalCount > 0 ? Math.round((earnedCount / totalCount) * 100) : 0

    const userInitials = (session.user.name || session.user.username || 'U')
        .split(' ')
        .map(n => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2)

    const joinDate = session.user.createdAt
        ? new Date(session.user.createdAt).toLocaleDateString(i18n.language, {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric'
        })
        : t('common.unknown')

    return (
        <>
            <CubeBackground />
            <div className="min-h-screen relative z-10">
                <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">

                    {/* Unified User Profile & Stats Card */}
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.05 }}
                    >
                        <Card className="border-2 border-primary/20">
                            <CardContent className="pt-8 pb-6">
                                {/* User Info Section */}
                                <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6 mb-8">
                                    <motion.div
                                        initial={{ scale: 0.8, opacity: 0 }}
                                        animate={{ scale: 1, opacity: 1 }}
                                        transition={{ delay: 0.1, type: "spring", stiffness: 200 }}
                                    >
                                        <AvatarUpload
                                            currentAvatarUrl={avatarUrl}
                                            userName={session.user.name || session.user.username}
                                            userInitials={userInitials}
                                            onAvatarChange={handleAvatarChange}
                                        />
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

                                {/* Stats Section */}
                                <Separator className="mb-6" />
                                <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
                                    {/* Total Score */}
                                    <div className="flex flex-col items-center text-center space-y-2">
                                        <div className="flex items-center justify-center w-12 h-12 rounded-full bg-yellow-500/10">
                                            <Trophy className="h-6 w-6 text-yellow-500" />
                                        </div>
                                        <div className="space-y-1">
                                            <div className="text-3xl font-bold bg-linear-to-r from-yellow-400 to-yellow-600 bg-clip-text text-transparent">
                                                {userProfile?.totalScore?.toLocaleString() || 0}
                                            </div>
                                            <div className="text-xs text-muted-foreground font-medium">
                                                {t('profile.totalScore')}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Current Streak */}
                                    <div className="flex flex-col items-center text-center space-y-2">
                                        <div className="flex items-center justify-center w-12 h-12 rounded-full bg-orange-500/10">
                                            <Flame className="h-6 w-6 text-orange-500" />
                                        </div>
                                        <div className="space-y-1">
                                            <div className="text-3xl font-bold bg-linear-to-r from-orange-400 to-orange-600 bg-clip-text text-transparent">
                                                {userProfile?.currentStreak || 0}
                                            </div>
                                            <div className="text-xs text-muted-foreground font-medium">
                                                {t('profile.currentStreak')}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Unlocked Achievements */}
                                    <div className="flex flex-col items-center text-center space-y-2">
                                        <div className="flex items-center justify-center w-12 h-12 rounded-full bg-primary/10">
                                            <Award className="h-6 w-6 text-primary" />
                                        </div>
                                        <div className="space-y-1">
                                            <div className="text-3xl font-bold bg-linear-to-r from-primary to-primary/60 bg-clip-text text-transparent">
                                                {earnedCount}
                                            </div>
                                            <div className="text-xs text-muted-foreground font-medium">
                                                {t('profile.unlocked')} ({completionPercentage}%)
                                            </div>
                                        </div>
                                    </div>

                                    {/* Achievement Points */}
                                    <div className="flex flex-col items-center text-center space-y-2">
                                        <div className="flex items-center justify-center w-12 h-12 rounded-full bg-green-500/10">
                                            <TrendingUp className="h-6 w-6 text-green-500" />
                                        </div>
                                        <div className="space-y-1">
                                            <div className="text-3xl font-bold bg-linear-to-r from-green-400 to-green-600 bg-clip-text text-transparent">
                                                {stats?.totalPoints || 0}
                                            </div>
                                            <div className="text-xs text-muted-foreground font-medium">
                                                {t('profile.achievementPoints')}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    </motion.div>

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
                </div>
            </div>
        </>
    )
}
