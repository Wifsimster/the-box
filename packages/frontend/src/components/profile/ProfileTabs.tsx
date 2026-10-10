import { lazy, Suspense, useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Trophy, Sparkles, Shield } from 'lucide-react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { AchievementGrid } from '@/components/achievement'
import { ReferralCard } from './ReferralCard'
import { EmailConsentCard } from './EmailConsentCard'
import { EditProfileCard } from './EditProfileCard'
import { AccountDataCard } from './AccountDataCard'
import { PushNotificationCard } from './PushNotificationCard'
import { ProfileSection } from './ProfileSection'
import { clearTourCompleted, markTourPending } from '@/components/onboarding/tour-storage'
import { useLocalizedPath } from '@/hooks/useLocalizedPath'
import { useFeatures } from '@/hooks/useFeatures'
import type { AchievementWithProgress, User as UserType } from '@the-box/types'
import { isThemeKey, type ThemeKey } from '@/lib/themes'

const StreamerKitCard = lazy(() =>
  import('./StreamerKitCard').then((m) => ({ default: m.StreamerKitCard })),
)
const GeoContributorCard = lazy(() =>
  import('./GeoContributorCard').then((m) => ({ default: m.GeoContributorCard })),
)
const AdvancedStatsPanel = lazy(() =>
  import('./AdvancedStatsPanel').then((m) => ({ default: m.AdvancedStatsPanel })),
)
const ThemeSwitcher = lazy(() =>
  import('./ThemeSwitcher').then((m) => ({ default: m.ThemeSwitcher })),
)
const SecurityPanel = lazy(() =>
  import('./SecurityPanel').then((m) => ({ default: m.SecurityPanel })),
)
const ActivityPanel = lazy(() =>
  import('./ActivityPanel').then((m) => ({ default: m.ActivityPanel })),
)
const SubscriptionPanel = lazy(() =>
  import('./SubscriptionPanel').then((m) => ({ default: m.SubscriptionPanel })),
)

type ProfileTab =
  | 'overview'
  | 'account'
  | 'security'
  | 'activity'
  | 'subscription'
  | 'creator'
  | 'customize'

const VALID_TABS: ReadonlyArray<ProfileTab> = [
  'overview',
  'account',
  'security',
  'activity',
  'subscription',
  'creator',
  'customize',
]

const GUEST_TABS: ReadonlyArray<ProfileTab> = ['overview', 'activity']

function parseTab(value: string | null): ProfileTab {
  return (VALID_TABS as ReadonlyArray<string>).includes(value ?? '')
    ? (value as ProfileTab)
    : 'overview'
}

function LazyPanelFallback() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-48 w-full" />
    </div>
  )
}

interface ProfileTabsProps {
  userProfile: UserType | null
  userAchievements: AchievementWithProgress[]
  isLoadingUserAchievements: boolean
  totalCount: number
  isPremium: boolean
  selectedTheme: ThemeKey
  onThemeChange: (theme: ThemeKey) => void
  language: string
  onProfileUpdated?: (user: UserType) => void
}

export function ProfileTabs({
  userProfile,
  userAchievements,
  isLoadingUserAchievements,
  totalCount,
  isPremium,
  selectedTheme,
  onThemeChange,
  language,
  onProfileUpdated,
}: ProfileTabsProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { localizedPath } = useLocalizedPath()
  const { geoCommunity } = useFeatures()
  const [searchParams, setSearchParams] = useSearchParams()

  const isGuest = !userProfile || userProfile.isGuest
  const activeTab = useMemo(() => {
    const tab = parseTab(searchParams.get('tab'))
    return isGuest && !GUEST_TABS.includes(tab) ? 'overview' : tab
  }, [searchParams, isGuest])

  const handleTabChange = useCallback(
    (value: string) => {
      const next = parseTab(value)
      setSearchParams(
        (prev) => {
          const sp = new URLSearchParams(prev)
          if (next === 'overview') sp.delete('tab')
          else sp.set('tab', next)
          return sp
        },
        { replace: false },
      )
    },
    [setSearchParams],
  )

  const handleReplayTour = useCallback(() => {
    clearTourCompleted()
    markTourPending()
    navigate(localizedPath('/'))
  }, [navigate, localizedPath])

  return (
    <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
      <TabsList className="flex w-full max-w-3xl mx-auto">
        <TabsTrigger value="overview" data-testid="profile-tab-overview">
          {t('profile.tabs.overview')}
        </TabsTrigger>
        <TabsTrigger value="activity" data-testid="profile-tab-activity">
          {t('profile.tabs.activity')}
        </TabsTrigger>
        {!isGuest && (
          <>
            <TabsTrigger value="account" data-testid="profile-tab-account">
              {t('profile.tabs.account')}
            </TabsTrigger>
            <TabsTrigger value="security" data-testid="profile-tab-security">
              {t('profile.tabs.security')}
            </TabsTrigger>
            <TabsTrigger value="subscription" data-testid="profile-tab-subscription">
              {t('profile.tabs.subscription')}
            </TabsTrigger>
            <TabsTrigger value="creator" data-testid="profile-tab-creator">
              {t('profile.tabs.creator')}
            </TabsTrigger>
            <TabsTrigger value="customize" data-testid="profile-tab-customize">
              {t('profile.tabs.customize')}
            </TabsTrigger>
          </>
        )}
      </TabsList>

      <TabsContent value="overview" className="space-y-6 mt-6">
        <ProfileSection>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Trophy className="size-5" aria-hidden="true" />
                {t('profile.title')}
                <span className="text-sm font-normal text-muted-foreground tabular-nums">({totalCount})</span>
              </CardTitle>
              <CardDescription>{t('profile.description')}</CardDescription>
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
                    {Array.from({ length: 6 }).map((_, i) => (
                      <Skeleton key={i} className="h-48" />
                    ))}
                  </div>
                </div>
              ) : (
                <AchievementGrid achievements={userAchievements} />
              )}
            </CardContent>
          </Card>
        </ProfileSection>
      </TabsContent>

      <TabsContent value="account" className="space-y-6 mt-6">
        {userProfile && !userProfile.isGuest && (
          <>
            <ProfileSection>
              <EditProfileCard
                displayName={userProfile.displayName}
                username={userProfile.username}
                country={userProfile.country}
                onUpdated={onProfileUpdated}
              />
            </ProfileSection>
            <ProfileSection delay={0.05}>
              <ReferralCard userId={userProfile.id} language={language} />
            </ProfileSection>
            <ProfileSection delay={0.1}>
              <EmailConsentCard
                initialConsent={userProfile.emailMarketingConsent}
                updatedAt={userProfile.emailConsentUpdatedAt}
              />
            </ProfileSection>
            <ProfileSection delay={0.15}>
              <PushNotificationCard />
            </ProfileSection>
            <ProfileSection delay={0.2}>
              <AccountDataCard username={userProfile.username} />
            </ProfileSection>
          </>
        )}
      </TabsContent>

      <TabsContent value="security" className="space-y-6 mt-6">
        {userProfile && !userProfile.isGuest && (
          <ProfileSection>
            <h2 className="mb-2 flex items-center gap-2 text-xl sm:text-2xl font-semibold">
              <Shield className="size-5 text-neon-purple" aria-hidden="true" />
              {t('security.title')}
            </h2>
            <Suspense fallback={<LazyPanelFallback />}>
              <SecurityPanel />
            </Suspense>
          </ProfileSection>
        )}
      </TabsContent>

      <TabsContent value="activity" className="space-y-6 mt-6">
        <ProfileSection>
          <Suspense fallback={<LazyPanelFallback />}>
            <ActivityPanel />
          </Suspense>
        </ProfileSection>
      </TabsContent>

      <TabsContent value="subscription" className="space-y-6 mt-6">
        {userProfile && !userProfile.isGuest && (
          <ProfileSection>
            <Suspense fallback={<LazyPanelFallback />}>
              <SubscriptionPanel />
            </Suspense>
          </ProfileSection>
        )}
      </TabsContent>

      <TabsContent value="creator" className="space-y-6 mt-6">
        {userProfile && !userProfile.isGuest && (
          <Suspense fallback={<LazyPanelFallback />}>
            <ProfileSection>
              <StreamerKitCard />
            </ProfileSection>
            {/* Gated at the mount site, not just inside the card: an empty
                ProfileSection still collects the parent's `space-y-6`, which
                would leave a 24px hole under the streamer kit. */}
            {geoCommunity && (
              <ProfileSection delay={0.05}>
                <GeoContributorCard />
              </ProfileSection>
            )}
          </Suspense>
        )}
      </TabsContent>

      <TabsContent value="customize" className="space-y-6 mt-6">
        {userProfile && !userProfile.isGuest && (
          <Suspense fallback={<LazyPanelFallback />}>
            {isPremium && (
              <ProfileSection>
                <AdvancedStatsPanel />
              </ProfileSection>
            )}
            <ProfileSection delay={0.05}>
              <ThemeSwitcher
                selected={isThemeKey(selectedTheme) ? selectedTheme : 'default'}
                isPremium={isPremium}
                onChange={onThemeChange}
              />
            </ProfileSection>
            <ProfileSection delay={0.1}>
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Sparkles className="size-5 text-neon-purple" />
                    {t('tour.replayTitle')}
                  </CardTitle>
                  <CardDescription>{t('tour.replayDescription')}</CardDescription>
                </CardHeader>
                <CardContent>
                  <Button variant="outline" onClick={handleReplayTour} className="w-full sm:w-auto">
                    <Sparkles aria-hidden="true" />
                    {t('tour.replayCta')}
                  </Button>
                </CardContent>
              </Card>
            </ProfileSection>
          </Suspense>
        )}
      </TabsContent>
    </Tabs>
  )
}
