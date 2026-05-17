import { Routes, Route, useLocation, useParams, Navigate, Outlet } from 'react-router-dom'
import { Suspense, lazy, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Header } from '@/components/layout/Header'
import { Footer } from '@/components/layout/Footer'
import { BottomNav } from '@/components/layout/BottomNav'
import { Toaster } from '@/components/ui/sonner'
import { cn } from '@/lib/utils'
import { ErrorBoundary, LazyComponentErrorBoundary } from '@/components/ErrorBoundary'
import { RouteSeo } from '@/components/RouteSeo'
import {
  PWAUpdatePrompt,
  OfflineIndicator,
  IOSInstallHint,
  InstallPromptBanner,
} from '@/components/pwa'
import { DailyRewardModal } from '@/components/daily-login'
import { useDailyLoginStore } from '@/stores/dailyLoginStore'
import { useSession } from '@/lib/auth-client'
import { useReferralCapture } from '@/hooks/useReferralCapture'
import { useGoatCounterPageviews } from '@/lib/analytics'
import { useApplyUserTheme } from '@/hooks/useApplyUserTheme'
import {
  connectNotificationsSocket,
  disconnectNotificationsSocket,
} from '@/lib/notifications-socket'
import {
  SUPPORTED_LANGUAGES,
  getBrowserLanguage,
  type SupportedLanguage,
} from '@/lib/i18n'

// Lazy load pages for better performance
const HomePage = lazy(() => import('@/pages/HomePage'))
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
const HistoryPage = lazy(() => import('@/pages/HistoryPage'))
const GameHistoryDetailsPage = lazy(() => import('@/pages/GameHistoryDetailsPage'))
const ProfilePage = lazy(() => import('@/pages/ProfilePage'))
const PublicProfilePage = lazy(() => import('@/pages/PublicProfilePage'))
const GeoPlayPage = lazy(() => import('@/pages/GeoPlayPage'))
const GeoContributePage = lazy(() => import('@/pages/GeoContributePage'))
const PricingPage = lazy(() => import('@/pages/PricingPage'))

function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  )
}

function LanguageRedirect() {
  const browserLang = getBrowserLanguage()
  return <Navigate to={`/${browserLang}`} replace />
}

function LanguageLayout() {
  const { lang } = useParams<{ lang: string }>()
  const { t, i18n } = useTranslation()
  const location = useLocation()
  const { data: session } = useSession()
  const { fetchStatus, reset } = useDailyLoginStore()

  // Sync i18n language with URL (must be before any early returns).
  // Also sync `<html lang>` so screen readers pick the right pronunciation.
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

  // Fetch daily login status when user is authenticated
  useEffect(() => {
    if (session?.user?.id) {
      fetchStatus(session.user.role ?? undefined)
    } else {
      // Reset store when user logs out
      reset()
    }
  }, [session?.user?.id, session?.user?.role, fetchStatus, reset])

  // Subscribe the authenticated user to the `/notifications` socket so account
  // events (Premium grants, future alerts) reach them on any page.
  useEffect(() => {
    const userId = session?.user?.id
    if (!userId) {
      disconnectNotificationsSocket()
      return
    }
    connectNotificationsSocket(userId)
  }, [session?.user?.id])

  // Apply the user's chosen UI theme on every session change. Free users
  // are pinned to default; premium users see their selected theme as
  // soon as /api/user/me resolves.
  useApplyUserTheme(session?.user?.id)

  // Validate language parameter
  if (!lang || !SUPPORTED_LANGUAGES.includes(lang as SupportedLanguage)) {
    const browserLang = getBrowserLanguage()
    return <Navigate to={`/${browserLang}`} replace />
  }

  // Geo play takes the full viewport (no header, no footer). The daily-game
  // page keeps the global Header so the hamburger stays reachable, but hides
  // the footer to preserve an immersive in-game feel.
  const isFullscreen = /\/geo\/?$/.test(location.pathname)
  const isInGame = location.pathname.endsWith('/play')
  const hideFooter = isFullscreen || isInGame
  // The BottomNav is mobile chrome — drop it on the fullscreen Geo route and
  // the in-game /play route, where it would collide with the keyboard-aware
  // guess input.
  const hideBottomNav = isFullscreen || isInGame

  return (
    <div
      className={cn(
        'flex min-h-dvh flex-col bg-background',
        // Reserve space so page content and the footer clear the fixed
        // BottomNav. border-box keeps this padding inside min-h-dvh.
        !hideBottomNav && 'pb-[var(--bottom-nav-space)] md:pb-0',
      )}
    >
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

      {/* Daily Login Reward Modal */}
      <DailyRewardModal />
    </div>
  )
}

function App() {
  useReferralCapture()
  useGoatCounterPageviews()

  return (
    <ErrorBoundary>
      <Routes>
        {/* Redirect root to browser language */}
        <Route path="/" element={<LanguageRedirect />} />

        {/* Language-prefixed routes */}
        <Route path="/:lang" element={<LanguageLayout />}>
          <Route index element={<HomePage />} />
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
          <Route path="history" element={<HistoryPage />} />
          <Route path="profile" element={<ProfilePage />} />
          <Route path="u/:username" element={<PublicProfilePage />} />

          <Route path="geo" element={<GeoPlayPage />} />
          <Route path="geo/play" element={<GeoPlayPage />} />
          <Route path="geo/contribute" element={<GeoContributePage />} />

          <Route path="premium" element={<PricingPage />} />
          {/* French-friendly alias resolves to the same component so links from
              older marketing copy still land. The page itself renders identically; SEO
              gets a single canonical via the language-prefixed /premium URL. */}
          <Route path="abonnement" element={<PricingPage />} />
        </Route>

        {/* Catch-all redirect to browser language */}
        <Route path="*" element={<LanguageRedirect />} />
      </Routes>

      {/* Global toast notifications (sonner) */}
      <Toaster />

      {/* PWA: offline banner + service-worker update toast + install prompts */}
      <OfflineIndicator />
      <PWAUpdatePrompt />
      <InstallPromptBanner />
      <IOSInstallHint />
    </ErrorBoundary>
  )
}

export default App
