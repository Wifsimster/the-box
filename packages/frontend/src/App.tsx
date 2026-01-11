import { Routes, Route, useLocation, useParams, Navigate, Outlet } from 'react-router-dom'
import { Suspense, lazy, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Header } from '@/components/layout/Header'
import { Footer } from '@/components/layout/Footer'
import { ToastContainer } from '@/components/ui/toast-container'
import { ErrorBoundary, LazyComponentErrorBoundary } from '@/components/ErrorBoundary'
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
const ContactPage = lazy(() => import('@/pages/ContactPage'))

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
  const { i18n } = useTranslation()
  const location = useLocation()

  // Validate language parameter
  if (!lang || !SUPPORTED_LANGUAGES.includes(lang as SupportedLanguage)) {
    const browserLang = getBrowserLanguage()
    return <Navigate to={`/${browserLang}`} replace />
  }

  // Sync i18n language with URL
  useEffect(() => {
    if (lang && i18n.language !== lang) {
      i18n.changeLanguage(lang)
    }
  }, [lang, i18n])

  // Check if current route is fullscreen (play page)
  const isFullscreen = location.pathname.endsWith('/play')

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {!isFullscreen && <Header />}
      <main className="flex-1">
        <LazyComponentErrorBoundary>
          <Suspense fallback={<LoadingSpinner />}>
            <Outlet />
          </Suspense>
        </LazyComponentErrorBoundary>
      </main>
      {!isFullscreen && <Footer />}
    </div>
  )
}

function App() {
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
          <Route path="contact" element={<ContactPage />} />
        </Route>

        {/* Catch-all redirect to browser language */}
        <Route path="*" element={<LanguageRedirect />} />
      </Routes>

      {/* Global toast notifications */}
      <ToastContainer />
    </ErrorBoundary>
  )
}

export default App
