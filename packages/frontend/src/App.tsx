import { Routes, Route, useLocation, useParams, Navigate, Outlet } from 'react-router-dom'
import { Suspense, lazy, useEffect } from 'react'
import { LazyMotion, MotionConfig, domAnimation } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import { Header } from '@/components/layout/Header'
import { Footer } from '@/components/layout/Footer'
import { BottomNav } from '@/components/layout/BottomNav'
import { Toaster } from '@/components/ui/sonner'
import { ThinkingOrb } from '@/components/ui/thinking-orb'
import { cn } from '@/lib/utils'
import { ErrorBoundary, LazyComponentErrorBoundary } from '@/components/ErrorBoundary'
import { RouteSeo } from '@/components/RouteSeo'
import {
  PWALifecycle,
  ChangelogDialog,
  OfflineIndicator,
  IOSInstallHint,
  InstallPromptBanner,
} from '@/components/pwa'
import { DailyRewardModal } from '@/components/daily-login'
import { useDailyLoginStore } from '@/stores/dailyLoginStore'
import { useAchievementStore } from '@/stores/achievementStore'
import { useGameStore } from '@/stores/gameStore'
import { isTodayPath } from '@/lib/dailyFirst'
import { useSession } from '@/lib/auth-client'
import { useReferralCapture } from '@/hooks/useReferralCapture'
import { ConsentBanner } from '@/components/consent/ConsentBanner'
import { useApplyUserTheme } from '@/hooks/useApplyUserTheme'
import { useLocalizedPath } from '@/hooks/useLocalizedPath'
import {
  connectNotificationsSocket,
  disconnectNotificationsSocket,
} from '@/lib/notifications-socket'
import {
  SUPPORTED_LANGUAGES,
  getBrowserLanguage,
  type SupportedLanguage,
} from '@/lib/i18n'

const HomePage = lazy(() => import('@/pages/HomePage'))
const TodayPage = lazy(() => import('@/pages/TodayPage'))
const GamePage = lazy(() => import('@/pages/GamePage'))
const LeaderboardPage = lazy(() => import('@/pages/LeaderboardPage'))
const ResultsPage = lazy(() => import('@/pages/ResultsPage'))
const LoginPage = lazy(() => import('@/pages/LoginPage'))
const RegisterPage = lazy(() => import('@/pages/RegisterPage'))
const ForgotPasswordPage = lazy(() => import('@/pages/ForgotPasswordPage'))
const ResetPasswordPage = lazy(() => import('@/pages/ResetPasswordPage'))
const TermsPage = lazy(() => import('@/pages/TermsPage'))
const PrivacyPage = lazy(() => import('@/pages/PrivacyPage'))
const CookiesPage = lazy(() => import('@/pages/CookiesPage'))
const FaqPage = lazy(() => import('@/pages/FaqPage'))
const RulesPage = lazy(() => import('@/pages/RulesPage'))
const ContactPage = lazy(() => import('@/pages/ContactPage'))
const AdminPage = lazy(() => import('@/pages/AdminPage'))
const GameHistoryDetailsPage = lazy(() => import('@/pages/GameHistoryDetailsPage'))
const ProfilePage = lazy(() => import('@/pages/ProfilePage'))
const PublicProfilePage = lazy(() => import('@/pages/PublicProfilePage'))
const GeoPlayPage = lazy(() => import('@/pages/GeoPlayPage'))
const GeoGamersPlayPage = lazy(() => import('@/pages/GeoGamersPlayPage'))
const GeoGamersPartyPage = lazy(() => import('@/pages/GeoGamersPartyPage'))
const GeoContributePage = lazy(() => import('@/pages/GeoContributePage'))
const PricingPage = lazy(() => import('@/pages/PricingPage'))
const TwoFactorChallengePage = lazy(() => import('@/pages/TwoFactorChallengePage'))

function LoadingSpinner() {
  const { t } = useTranslation()
  return (
    <div className="flex min-h-[var(--page-h)] items-center justify-center">
      <ThinkingOrb state="searching" size={64} aria-label={t('common.loading')} />
    </div>
  )
}

function LanguageRedirect() {
  const browserLang = getBrowserLanguage()
  return <Navigate to={`/${browserLang}`} replace />
}

function ProfileTabRedirect({ tab }: { tab: string }) {
  const { localizedPath } = useLocalizedPath()
  return <Navigate to={localizedPath(`/profile?tab=${tab}`)} replace />
}

function BottomNavSpaceSync({ hidden }: { hidden: boolean }) {
  useEffect(() => {
    const root = document.documentElement
    if (hidden) {
      root.dataset.bottomNav = 'hidden'
    } else {
      delete root.dataset.bottomNav
    }
    return () => {
      delete root.dataset.bottomNav
    }
  }, [hidden])
  return null
}

function LanguageLayout() {
  const { lang } = useParams<{ lang: string }>()
  const { t, i18n } = useTranslation()
  const location = useLocation()
  const { data: session } = useSession()
  const { fetchStatus, reset } = useDailyLoginStore()
  const gamePhase = useGameStore((state) => state.gamePhase)

  useEffect(() => {
    if (lang && SUPPORTED_LANGUAGES.includes(lang as SupportedLanguage)) {
      if (i18n.language !== lang) {
        i18n.changeLanguage(lang)
      }
      if (typeof document !== 'undefined' && document.documentElement.lang !== lang) {
        document.documentElement.lang = lang
      }
    }
  }, [lang, i18n])

  useEffect(() => {
    if (session?.user?.id) {
      fetchStatus(session.user.role ?? undefined)
    } else {
      reset()
    }
  }, [session?.user?.id, session?.user?.role, fetchStatus, reset])

  useEffect(() => {
    const userId = session?.user?.id
    if (!userId) {
      disconnectNotificationsSocket()
      return
    }
    connectNotificationsSocket(userId)
  }, [session?.user?.id])

  useEffect(() => {
    if (!session?.user?.id) return
    const onAchievementUnlocked = (): void => {
      void useAchievementStore.getState().fetchUserAchievements()
    }
    window.addEventListener('achievement:unlocked', onAchievementUnlocked)
    return () =>
      window.removeEventListener('achievement:unlocked', onAchievementUnlocked)
  }, [session?.user?.id])

  useApplyUserTheme(session?.user?.id)

  if (!lang || !SUPPORTED_LANGUAGES.includes(lang as SupportedLanguage)) {
    const browserLang = getBrowserLanguage()
    return <Navigate to={`/${browserLang}`} replace />
  }

  const isFullscreen = /\/geo\/?$/.test(location.pathname)
  const isTodayRoute = isTodayPath(location.pathname)
  const isTodayInGame = isTodayRoute && (gamePhase === 'playing' || gamePhase === 'result')
  const isInGame = location.pathname.endsWith('/play') || isTodayInGame
  const hideFooter = isFullscreen || isInGame
  const hideBottomNav = isFullscreen || isInGame

  return (
    <div
      className={cn(
        'flex min-h-dvh flex-col bg-background',
        !hideBottomNav && 'pb-[var(--bottom-nav-space)] md:pb-0',
      )}
    >
      <BottomNavSpaceSync hidden={hideBottomNav} />
      <RouteSeo />
      <a
        href="#main-content"
        className="sr-only rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-lg focus:not-sr-only focus:fixed focus:left-4 focus:top-[calc(1rem_+_env(safe-area-inset-top))] focus:z-[100]"
      >
        {t('nav.skipToContent')}
      </a>
      {!isFullscreen && <Header />}
      <main id="main-content" tabIndex={-1} className="flex-1 outline-none">
        <LazyComponentErrorBoundary>
          <Suspense fallback={<LoadingSpinner />}>
            <Outlet />
          </Suspense>
        </LazyComponentErrorBoundary>
      </main>
      {!hideFooter && <Footer />}
      {!hideBottomNav && <BottomNav />}

      <DailyRewardModal />

      <ConsentBanner />
    </div>
  )
}

function App() {
  useReferralCapture()

  return (
    <ErrorBoundary>
      <LazyMotion features={domAnimation} strict>
      <MotionConfig reducedMotion="user">
      <Routes>
        <Route path="/" element={<LanguageRedirect />} />

        <Route path="/:lang" element={<LanguageLayout />}>
          <Route index element={<TodayPage />} />
          <Route path="about" element={<HomePage />} />
          <Route path="play" element={<GamePage />} />
          <Route path="leaderboard" element={<LeaderboardPage />} />
          <Route path="results" element={<ResultsPage />} />
          <Route path="login" element={<LoginPage />} />
          <Route path="register" element={<RegisterPage />} />
          <Route path="forgot-password" element={<ForgotPasswordPage />} />
          <Route path="reset-password" element={<ResetPasswordPage />} />
          <Route path="terms" element={<TermsPage />} />
          <Route path="privacy" element={<PrivacyPage />} />
          <Route path="cookies" element={<CookiesPage />} />
          <Route path="faq" element={<FaqPage />} />
          <Route path="rules" element={<RulesPage />} />
          <Route path="contact" element={<ContactPage />} />
          <Route path="admin" element={<AdminPage />} />
          <Route path="history/:sessionId" element={<GameHistoryDetailsPage />} />
          <Route path="history" element={<ProfileTabRedirect tab="activity" />} />
          <Route path="profile" element={<ProfilePage />} />
          <Route path="settings/security" element={<ProfileTabRedirect tab="security" />} />
          <Route path="two-factor" element={<TwoFactorChallengePage />} />
          <Route path="u/:username" element={<PublicProfilePage />} />

          <Route path="geo" element={<GeoPlayPage />} />
          <Route path="geo/play" element={<GeoPlayPage />} />
          <Route path="panorama" element={<GeoGamersPlayPage />} />
          <Route path="panorama/party" element={<GeoGamersPartyPage />} />
          <Route path="geo/contribute" element={<GeoContributePage />} />

          <Route path="premium" element={<PricingPage />} />
          <Route path="abonnement" element={<PricingPage />} />
        </Route>

        <Route path="*" element={<LanguageRedirect />} />
      </Routes>

      <Toaster />

      <OfflineIndicator />
      <PWALifecycle />
      <ChangelogDialog />
      <InstallPromptBanner />
      <IOSInstallHint />
      </MotionConfig>
      </LazyMotion>
    </ErrorBoundary>
  )
}

export default App
