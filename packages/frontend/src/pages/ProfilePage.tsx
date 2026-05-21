import { useEffect, useState, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/hooks/useAuth'
import { useLocalizedPath } from '@/hooks/useLocalizedPath'
import { useAchievementStore } from '@/stores/achievementStore'
import { useDailyLoginStore } from '@/stores/dailyLoginStore'
import { useBillingStore } from '@/stores/billingStore'
import { CubeBackground } from '@/components/backgrounds/CubeBackground'
import {
  ProfileHeaderCard,
  ProfileSection,
  ProfileSkeleton,
  ProfileTabs,
} from '@/components/profile'
import { isThemeKey, type ThemeKey } from '@/lib/themes'
import type { User as UserType } from '@the-box/types'

/**
 * ProfilePage — user identity + achievements (Overview) with Account / Creator /
 * Customize tabs for everything else. Heavy panels (StreamerKit, AdvancedStats,
 * GeoContributor, ThemeSwitcher) are lazy-loaded per tab.
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
    isLoadingUserAchievements,
  } = useAchievementStore()
  const inventory = useDailyLoginStore((s) => s.inventory)
  const fetchInventory = useDailyLoginStore((s) => s.fetchInventory)
  const streakFreezeCount = inventory?.powerups['streak_freeze'] ?? 0

  const billingEntitlement = useBillingStore((state) => state.entitlement)
  const fetchBillingEntitlement = useBillingStore((state) => state.fetchEntitlement)
  const isPremium = !!billingEntitlement?.isPremium
  const [selectedTheme, setSelectedTheme] = useState<ThemeKey>('default')

  useEffect(() => {
    void fetchBillingEntitlement()
  }, [fetchBillingEntitlement, session?.user?.id])

  /* eslint-disable react-hooks/set-state-in-effect -- Sync server-fetched theme into local state for optimistic switching */
  useEffect(() => {
    const fetched = userProfile?.selectedTheme
    if (fetched && isThemeKey(fetched)) setSelectedTheme(fetched)
  }, [userProfile?.selectedTheme])
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    if (session?.user?.id) {
      void fetchInventory()
    }
  }, [session?.user?.id, fetchInventory])

  const handleAvatarChange = useCallback((newAvatarUrl: string | null) => {
    setAvatarUrl(newAvatarUrl)
  }, [])

  useEffect(() => {
    if (!isPending && !session) {
      navigate(localizedPath('/login'))
    }
  }, [isPending, session, navigate, localizedPath])

  /* eslint-disable react-hooks/set-state-in-effect -- Necessary pattern for data fetching */
  useEffect(() => {
    if (session && !hasFetched.current) {
      hasFetched.current = true
      setError(null)

      Promise.all([
        fetchUserAchievements(),
        fetch('/api/user/me', { credentials: 'include' })
          .then((res) => res.json())
          .then((json) => {
            if (json.success && json.data) {
              setUserProfile(json.data)
              setAvatarUrl(json.data.avatarUrl ?? session.user.image ?? null)
            }
          }),
      ])
        .then(() => setError(null))
        .catch((err) => setError(err?.message || 'Failed to load profile data'))
        .finally(() => setLoading(false))
    }
  }, [session, fetchUserAchievements])
  /* eslint-enable react-hooks/set-state-in-effect */

  if (isPending || loading) {
    return <ProfileSkeleton />
  }

  if (!session) {
    return null
  }

  const earnedCount = userAchievements.filter(
    (a) => a.earned || (a.progressMax != null && a.progress >= a.progressMax),
  ).length
  const totalCount = userAchievements.length
  const completionPercentage = totalCount > 0 ? Math.round((earnedCount / totalCount) * 100) : 0

  const userInitials = (session.user.name || session.user.username || 'U')
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)

  const joinDate = session.user.createdAt
    ? new Date(session.user.createdAt).toLocaleDateString(i18n.language, {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      })
    : t('common.unknown')

  return (
    <>
      <CubeBackground />
      <div className="min-h-screen relative z-10">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 pb-[calc(2rem+var(--bottom-nav-h,0px))] space-y-6">
          <ProfileSection delay={0.05}>
            <ProfileHeaderCard
              avatarUrl={avatarUrl}
              userName={session.user.name || session.user.username}
              userInitials={userInitials}
              email={session.user.email}
              emailVerified={session.user.emailVerified}
              joinDate={joinDate}
              isPremium={isPremium}
              totalScore={userProfile?.totalScore ?? 0}
              currentStreak={userProfile?.currentStreak ?? 0}
              streakFreezeCount={streakFreezeCount}
              earnedCount={earnedCount}
              totalCount={totalCount}
              completionPercentage={completionPercentage}
              totalPoints={stats?.totalPoints ?? 0}
              onAvatarChange={handleAvatarChange}
            />
          </ProfileSection>

          <ProfileTabs
            userProfile={userProfile}
            userAchievements={userAchievements}
            isLoadingUserAchievements={isLoadingUserAchievements}
            totalCount={totalCount}
            isPremium={isPremium}
            selectedTheme={selectedTheme}
            onThemeChange={setSelectedTheme}
            language={i18n.language}
          />
        </div>
      </div>
    </>
  )
}
