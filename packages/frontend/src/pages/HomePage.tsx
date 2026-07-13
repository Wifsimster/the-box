import { useTranslation } from 'react-i18next'
import { m, type MotionProps } from 'framer-motion'
import { lazy, Suspense, useEffect, useReducer, useState, useMemo } from 'react'
import { useLocalizedPath } from '@/hooks/useLocalizedPath'
import { useOnline } from '@/hooks/useOnline'
import { useSession } from '@/lib/auth-client'
import { gameApi } from '@/lib/api/game'
import { useNextDailyCountdown } from '@/hooks/useNextDailyCountdown'
import { WelcomeModal } from '@/components/onboarding/WelcomeModal'
import { TourGuide } from '@/components/onboarding/TourGuide'
import { consumeTourPending, hasCompletedTour, TOUR_REPLAY_EVENT } from '@/components/onboarding/tour-storage'
import { StreakRiskBanner } from '@/components/daily-login/StreakRiskBanner'
import { HomeAchievementTeaser } from '@/components/home/HomeAchievementTeaser'
import { HomeDailyCta } from '@/components/home/HomeDailyCta'
import { HomeModesShowcase } from '@/components/home/HomeModesShowcase'
import { HomePremiumTeaser } from '@/components/home/HomePremiumTeaser'
import { HomeSocialProof } from '@/components/home/HomeSocialProof'
import { useBillingStore } from '@/stores/billingStore'
import { useReducedMotionSafe } from '@/hooks/useReducedMotionSafe'

// CubeBackground pulls in Three.js + react-three-fiber, so split it into
// its own chunk and skip rendering entirely when the visitor prefers
// reduced motion (the chunk also never gets fetched in that case).
const CubeBackground = lazy(() =>
  import('@/components/backgrounds/CubeBackground').then((mod) => ({ default: mod.CubeBackground })),
)

interface YesterdayChallenge {
  challengeId: number
  date: string
  hasPlayed: boolean
  isCompleted?: boolean
}

interface DailyStatusState {
  isTodayCompleted: boolean
  todayScore: number
  screenshotsFound: number
  isLoading: boolean
  yesterdayChallenge: YesterdayChallenge | null
  previewAvailable: boolean
}

type DailyStatusAction =
  | {
      type: 'todayLoaded'
      isCompleted: boolean
      totalScore: number
      screenshotsFound: number
      yesterdayChallenge: YesterdayChallenge | null
    }
  | { type: 'loadingDone' }
  | { type: 'previewAvailable'; available: boolean }

const initialDailyStatus: DailyStatusState = {
  isTodayCompleted: false,
  todayScore: 0,
  screenshotsFound: 0,
  isLoading: true,
  yesterdayChallenge: null,
  previewAvailable: false,
}

function dailyStatusReducer(
  state: DailyStatusState,
  action: DailyStatusAction,
): DailyStatusState {
  switch (action.type) {
    case 'todayLoaded':
      return {
        ...state,
        isTodayCompleted: action.isCompleted,
        todayScore: action.totalScore,
        screenshotsFound: action.screenshotsFound,
        yesterdayChallenge: action.yesterdayChallenge,
        isLoading: false,
      }
    case 'loadingDone':
      return { ...state, isLoading: false }
    case 'previewAvailable':
      return { ...state, previewAvailable: action.available }
    default:
      return state
  }
}

export default function HomePage() {
  const { t, i18n } = useTranslation()
  const { localizedPath } = useLocalizedPath()
  const { data: session } = useSession()
  const [dailyStatus, dispatchDailyStatus] = useReducer(
    dailyStatusReducer,
    initialDailyStatus,
  )
  const {
    isTodayCompleted,
    todayScore,
    screenshotsFound,
    isLoading,
    yesterdayChallenge,
    previewAvailable,
  } = dailyStatus
  const timeRemaining = useNextDailyCountdown()
  const isOnline = useOnline()
  const billingEntitlement = useBillingStore((state) => state.entitlement)
  const billingPrices = useBillingStore((state) => state.prices)
  const fetchBillingPrices = useBillingStore((state) => state.fetchPrices)
  // Header hydrates the entitlement on mount; treat unknown as "not premium"
  // so the teaser shows for anonymous visitors and free users alike.
  const showPremiumTeaser = !billingEntitlement?.isPremium

  useEffect(() => {
    if (!showPremiumTeaser) return
    void fetchBillingPrices()
  }, [showPremiumTeaser, fetchBillingPrices])

  // Cheapest entry price for the teaser hook. Hidden until prices arrive so
  // we never flash a "From €0.00" placeholder.
  const monthlyPriceLabel = useMemo(() => {
    const monthly = billingPrices.find((p) => p.tier === 'premium_monthly' && p.active)
    if (!monthly) return null
    return new Intl.NumberFormat(i18n.language, {
      style: 'currency',
      currency: monthly.currency.toUpperCase(),
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(monthly.unitAmount / 100)
  }, [billingPrices, i18n.language])

  const reducedMotion = useReducedMotionSafe()

  // Home tour: opens once the page has settled. WelcomeModal flips the
  // "pending" flag on close; otherwise we open it for any visitor who
  // hasn't completed (or dismissed) it yet. Skipping or finishing marks
  // it complete via the TourGuide itself.
  const [tourOpen, setTourOpen] = useState(false)
  useEffect(() => {
    const id = window.setTimeout(() => {
      if (consumeTourPending() || !hasCompletedTour()) {
        setTourOpen(true)
      }
    }, 600)
    return () => window.clearTimeout(id)
  }, [])

  // Replay from the user menu while already on this page — the mount-time
  // effect above won't re-run, so listen for the explicit replay event.
  useEffect(() => {
    const handler = () => setTourOpen(true)
    window.addEventListener(TOUR_REPLAY_EVENT, handler)
    return () => window.removeEventListener(TOUR_REPLAY_EVENT, handler)
  }, [])

  // Helper: drop `initial`/`animate`/`transition` when reduced motion is
  // preferred so motion components render statically without changing layout.
  const motionProps = (props: MotionProps): MotionProps => (reducedMotion ? {} : props)

  // Pick a stable random fraction once on mount so the chosen message stays
  // fixed across countdown re-renders (and so selection stays pure during
  // render — Math.random() may not be called while rendering).
  const [messageSeed] = useState(Math.random)

  // Memoize humorous message to prevent re-selection on countdown re-renders
  const humorousMessage = useMemo(() => {
    if (!isTodayCompleted) return ''

    let category: 'perfect' | 'excellent' | 'good' | 'average' | 'low'

    if (screenshotsFound === 10 && todayScore >= 4500) {
      category = 'perfect'
    } else if (todayScore >= 3500 || screenshotsFound >= 8) {
      category = 'excellent'
    } else if (todayScore >= 2000 || screenshotsFound >= 6) {
      category = 'good'
    } else if (todayScore >= 1000 || screenshotsFound >= 4) {
      category = 'average'
    } else {
      category = 'low'
    }

    const messages = t(`home.completionMessages.${category}`, { returnObjects: true }) as string[]
    return messages[Math.floor(messageSeed * messages.length)]
  }, [isTodayCompleted, todayScore, screenshotsFound, messageSeed, t])

  // Probe the public preview endpoint so we only render the teaser card
  // when a challenge actually exists for today.
  useEffect(() => {
    if (session?.user?.id) return
    let cancelled = false
    gameApi.getPreview()
      .then(() => { if (!cancelled) dispatchDailyStatus({ type: 'previewAvailable', available: true }) })
      .catch(() => { if (!cancelled) dispatchDailyStatus({ type: 'previewAvailable', available: false }) })
    return () => { cancelled = true }
  }, [session?.user?.id])

  // Check if user has already completed today's challenge
  useEffect(() => {
    const checkTodayChallenge = async () => {
      if (!session?.user?.id) {
        dispatchDailyStatus({ type: 'loadingDone' })
        return
      }

      try {
        const data = await gameApi.getTodayChallenge()
        dispatchDailyStatus({
          type: 'todayLoaded',
          isCompleted: !!data.userSession?.isCompleted,
          totalScore: data.userSession?.totalScore ?? 0,
          screenshotsFound: data.userSession?.screenshotsFound ?? 0,
          yesterdayChallenge: data.yesterdayChallenge ?? null,
        })
      } catch (error) {
        console.error('Failed to check today challenge:', error)
        dispatchDailyStatus({ type: 'loadingDone' })
      }
    }

    checkTodayChallenge()
  }, [session?.user?.id])

  return (
    <>
      {reducedMotion ? (
        // Plain dark backdrop — no Canvas, no chunk fetch.
        <div className="fixed inset-0 z-0 bg-background" aria-hidden="true" />
      ) : (
        <Suspense fallback={null}>
          <CubeBackground />
        </Suspense>
      )}
      <WelcomeModal />
      <TourGuide open={tourOpen} onClose={() => setTourOpen(false)} />
      <div className="container mx-auto px-4 py-8 sm:py-10 md:py-12 lg:py-16 relative z-10">
        <StreakRiskBanner />
        {/* Hero Section */}
        <m.div
          {...motionProps({
            initial: { opacity: 0, y: 20 },
            animate: { opacity: 1, y: 0 },
            transition: { duration: 0.5 },
          })}
          className="text-center mb-8 sm:mb-10 md:mb-12 lg:mb-16"
        >
          <m.img
            src="/logo.svg"
            alt="The Box"
            {...motionProps({
              initial: { scale: 0.8 },
              animate: { scale: 1 },
              transition: { duration: 0.5, delay: 0.2 },
            })}
            className="size-16 sm:size-20 md:size-24 mb-4 sm:mb-5 md:mb-6 mx-auto"
          />

          {/* Brand wordmark stays small — the logo already carries it — so
              the value headline is the loudest thing in the hero (principle:
              sell from the hero, lead with value not the brand name). */}
          <p className="text-xs sm:text-sm font-semibold uppercase tracking-[0.2em] text-neon-purple/80 mb-2">
            {t('home.title')}
          </p>

          <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold mb-3 sm:mb-4 gradient-gaming-title">
            {t('home.headline')}
          </h1>

          <p className="text-sm sm:text-base md:text-lg lg:text-xl text-muted-foreground max-w-2xl mx-auto px-2 sm:px-4">
            {t('home.subtitle')}
          </p>

          <HomeSocialProof />
        </m.div>

        {/* CTA Button */}
        <HomeDailyCta
          status={{
            isLoading,
            isTodayCompleted,
            isOnline,
            hasSession: !!session,
            previewAvailable,
          }}
          todayScore={todayScore}
          screenshotsFound={screenshotsFound}
          humorousMessage={humorousMessage}
          timeRemaining={timeRemaining}
          yesterdayChallenge={yesterdayChallenge}
          motionProps={motionProps}
        />

        {/* Game-modes showcase — explains the secondary modes (Geo,
            GeoGamers) in one sentence each with a direct link, so the nav
            badges aren't the only hint that these modes exist. */}
        <HomeModesShowcase />

        {/* Premium teaser — surfaces subscriptions now that paid features
            are live. Hidden once the visitor already has Premium so we don't
            nag paying users. Falls back to "show" for anonymous visitors
            since the entitlement store treats 401 as the free tier. */}
        {showPremiumTeaser && (
          <HomePremiumTeaser
            premiumHref={localizedPath('/premium')}
            monthlyPriceLabel={monthlyPriceLabel}
            motionProps={motionProps}
          />
        )}

        {/* Achievement teaser — replaces the static "Panorama / Daily"
            features grid with aspirational social proof: three locked
            achievements pulled from the catalog (or the visitor's own
            unearned set when authenticated). Fail-soft: renders nothing
            if the API errors. */}
        <HomeAchievementTeaser />
      </div>
    </>
  )
}
