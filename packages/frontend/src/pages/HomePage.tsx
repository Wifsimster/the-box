import { useTranslation } from 'react-i18next'
import { m, type MotionProps } from 'framer-motion'
import { lazy, Suspense, useEffect, useReducer, useState, useMemo } from 'react'
import { useLocalizedPath } from '@/hooks/useLocalizedPath'
import { useOnline } from '@/hooks/useOnline'
import { useSession } from '@/lib/auth-client'
import { gameApi } from '@/lib/api/game'
import { useNextDailyCountdown } from '@/hooks/useNextDailyCountdown'
import { WelcomeModal } from '@/components/onboarding/WelcomeModal'
import { StreakRiskBanner } from '@/components/daily-login/StreakRiskBanner'
import { HomeAchievementTeaser } from '@/components/home/HomeAchievementTeaser'
import { HomeDailyCta } from '@/components/home/HomeDailyCta'
import { HomeModesShowcase } from '@/components/home/HomeModesShowcase'
import { HomePremiumTeaser } from '@/components/home/HomePremiumTeaser'
import { HomeSocialProof } from '@/components/home/HomeSocialProof'
import { useBillingStore } from '@/stores/billingStore'
import { useReducedMotionSafe } from '@/hooks/useReducedMotionSafe'

const CubeBackground = lazy(() =>
  import('@/components/backgrounds/CubeBackground').then((mod) => ({ default: mod.CubeBackground })),
)

function prefersLiteBackground(): boolean {
  if (typeof navigator === 'undefined') return true
  const nav = navigator as Navigator & {
    connection?: { saveData?: boolean }
    deviceMemory?: number
  }
  if (nav.connection?.saveData) return true
  if (typeof nav.deviceMemory === 'number' && nav.deviceMemory < 4) return true
  if (typeof nav.hardwareConcurrency === 'number' && nav.hardwareConcurrency <= 4) return true
  return false
}

function useIdleReady(enabled: boolean): boolean {
  const [ready, setReady] = useState(false)
  useEffect(() => {
    if (!enabled) return
    const w = window as Window & {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number
      cancelIdleCallback?: (id: number) => void
    }
    if (w.requestIdleCallback) {
      const id = w.requestIdleCallback(() => setReady(true), { timeout: 2000 })
      return () => w.cancelIdleCallback?.(id)
    }
    const id = window.setTimeout(() => setReady(true), 800)
    return () => window.clearTimeout(id)
  }, [enabled])
  return enabled && ready
}

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
  const showPremiumTeaser = !billingEntitlement?.isPremium

  useEffect(() => {
    if (!showPremiumTeaser) return
    void fetchBillingPrices()
  }, [showPremiumTeaser, fetchBillingPrices])

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
  const [liteBackground] = useState(prefersLiteBackground)
  const showCubeBackground = useIdleReady(!reducedMotion && !liteBackground)

  const motionProps = (props: MotionProps): MotionProps => (reducedMotion ? {} : props)

  const [messageSeed] = useState(Math.random)

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

  useEffect(() => {
    if (session?.user?.id) return
    let cancelled = false
    gameApi.getPreview()
      .then(() => { if (!cancelled) dispatchDailyStatus({ type: 'previewAvailable', available: true }) })
      .catch(() => { if (!cancelled) dispatchDailyStatus({ type: 'previewAvailable', available: false }) })
    return () => { cancelled = true }
  }, [session?.user?.id])

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
      {showCubeBackground ? (
        <Suspense fallback={null}>
          <CubeBackground />
        </Suspense>
      ) : (
        <div className="fixed inset-0 z-0 bg-background" aria-hidden="true" />
      )}
      <WelcomeModal />
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 md:py-12 relative z-10 space-y-8 md:space-y-12">
        <m.div
          {...motionProps({
            initial: { opacity: 0, y: 20 },
            animate: { opacity: 1, y: 0 },
            transition: { duration: 0.5 },
          })}
          className="text-center"
        >
          <m.img
            src={isTodayCompleted ? '/logo.svg' : '/logo-open.svg'}
            alt=""
            aria-hidden="true"
            {...motionProps({
              initial: { scale: 0.8 },
              animate: { scale: 1 },
              transition: { duration: 0.5, delay: 0.2 },
            })}
            className="size-14 sm:size-20 md:size-24 mb-3 sm:mb-5 md:mb-6 mx-auto"
          />

          <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold mb-2 sm:mb-4 gradient-gaming-title">
            {t('home.headline')}
          </h1>

          <p className="text-base md:text-lg lg:text-xl text-muted-foreground text-balance max-w-2xl mx-auto">
            {t('home.subtitle')}
          </p>

          <HomeSocialProof />
        </m.div>

        <div className="space-y-4">
          <StreakRiskBanner />
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
        </div>

        <HomeModesShowcase />

        {showPremiumTeaser && (
          <HomePremiumTeaser
            premiumHref={localizedPath('/premium')}
            monthlyPriceLabel={monthlyPriceLabel}
            motionProps={motionProps}
          />
        )}

        <HomeAchievementTeaser />
      </div>
    </>
  )
}
