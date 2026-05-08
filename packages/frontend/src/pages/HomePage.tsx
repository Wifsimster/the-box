import { useNavigate, Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { motion, type MotionProps } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { GradientIcon } from '@/components/ui/gradient-icon'
import { Play, Trophy, History, Clock, CalendarDays, ArrowRight, Sparkles, Check, MapPin } from 'lucide-react'
import { lazy, Suspense, useEffect, useState, useMemo } from 'react'
import { useLocalizedPath } from '@/hooks/useLocalizedPath'
import { useOnline } from '@/hooks/useOnline'
import { useSession } from '@/lib/auth-client'
import { gameApi } from '@/lib/api/game'
import { useNextDailyCountdown } from '@/hooks/useNextDailyCountdown'
import { WelcomeModal } from '@/components/onboarding/WelcomeModal'
import { StreakRiskBanner } from '@/components/daily-login/StreakRiskBanner'
import { HomeAchievementTeaser } from '@/components/home/HomeAchievementTeaser'
import { useBillingStore } from '@/stores/billingStore'
import { useReducedMotionSafe } from '@/hooks/useReducedMotionSafe'

// CubeBackground pulls in Three.js + react-three-fiber, so split it into
// its own chunk and skip rendering entirely when the visitor prefers
// reduced motion (the chunk also never gets fetched in that case).
const CubeBackground = lazy(() =>
  import('@/components/backgrounds/CubeBackground').then((mod) => ({ default: mod.CubeBackground })),
)

export default function HomePage() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const { localizedPath } = useLocalizedPath()
  const { data: session } = useSession()
  const [isTodayCompleted, setIsTodayCompleted] = useState(false)
  const [todayScore, setTodayScore] = useState<number>(0)
  const [screenshotsFound, setScreenshotsFound] = useState<number>(0)
  const [isLoading, setIsLoading] = useState(true)
  const [yesterdayChallenge, setYesterdayChallenge] = useState<{
    challengeId: number
    date: string
    hasPlayed: boolean
    isCompleted?: boolean
  } | null>(null)
  const [previewAvailable, setPreviewAvailable] = useState(false)
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

  // Helper: drop `initial`/`animate`/`transition` when reduced motion is
  // preferred so motion components render statically without changing layout.
  const motionProps = (props: MotionProps): MotionProps => (reducedMotion ? {} : props)

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
    return messages[Math.floor(Math.random() * messages.length)]
  }, [isTodayCompleted, todayScore, screenshotsFound, t])

  // Probe the public preview endpoint so we only render the teaser card
  // when a challenge actually exists for today.
  useEffect(() => {
    if (session?.user?.id) return
    let cancelled = false
    gameApi.getPreview()
      .then(() => { if (!cancelled) setPreviewAvailable(true) })
      .catch(() => { if (!cancelled) setPreviewAvailable(false) })
    return () => { cancelled = true }
  }, [session?.user?.id])

  // Check if user has already completed today's challenge
  useEffect(() => {
    const checkTodayChallenge = async () => {
      if (!session?.user?.id) {
        setIsLoading(false)
        return
      }

      try {
        const data = await gameApi.getTodayChallenge()
        // Check if user has an existing session that is completed
        if (data.userSession?.isCompleted) {
          setIsTodayCompleted(true)
          setTodayScore(data.userSession.totalScore)
          setScreenshotsFound(data.userSession.screenshotsFound)
        }
        // Set yesterday's challenge info if available
        if (data.yesterdayChallenge) {
          setYesterdayChallenge(data.yesterdayChallenge)
        }
      } catch (error) {
        console.error('Failed to check today challenge:', error)
      } finally {
        setIsLoading(false)
      }
    }

    checkTodayChallenge()
  }, [session?.user?.id])

  return (
    <>
      {reducedMotion ? (
        // Plain dark backdrop — no Canvas, no chunk fetch.
        <div className="fixed inset-0 z-0 bg-black" aria-hidden="true" />
      ) : (
        <Suspense fallback={null}>
          <CubeBackground />
        </Suspense>
      )}
      <WelcomeModal />
      <div className="container mx-auto px-4 py-8 sm:py-10 md:py-12 lg:py-16 relative z-10">
        <StreakRiskBanner />
        {/* Hero Section */}
        <motion.div
          {...motionProps({
            initial: { opacity: 0, y: 20 },
            animate: { opacity: 1, y: 0 },
            transition: { duration: 0.5 },
          })}
          className="text-center mb-8 sm:mb-10 md:mb-12 lg:mb-16"
        >
          <motion.img
            src="/logo.svg"
            alt="The Box"
            {...motionProps({
              initial: { scale: 0.8 },
              animate: { scale: 1 },
              transition: { duration: 0.5, delay: 0.2 },
            })}
            className="h-16 w-16 sm:h-20 sm:w-20 md:h-24 md:w-24 mb-4 sm:mb-5 md:mb-6 mx-auto"
          />

          <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold mb-3 sm:mb-4 gradient-gaming-title">
            {t('home.title')}
          </h1>

          <p className="text-sm sm:text-base md:text-lg lg:text-xl text-muted-foreground max-w-2xl mx-auto px-2 sm:px-4">
            {t('home.subtitle')}
          </p>
        </motion.div>

        {/* CTA Button */}
        <motion.div
          {...motionProps({
            initial: { opacity: 0, scale: 0.9 },
            animate: { opacity: 1, scale: 1 },
            transition: { duration: 0.5, delay: 0.4 },
          })}
          className="flex flex-col items-center gap-4 mb-8 sm:mb-10 md:mb-12 lg:mb-16"
        >
          {/* Show completion message if today's challenge is completed */}
          {isTodayCompleted && (
            <div className="text-center max-w-xl mx-auto">
              <div className="bg-card/80 backdrop-blur-sm border border-neon-purple/30 rounded-lg p-4 sm:p-6 mb-3">
                <p className="text-lg sm:text-xl font-bold text-foreground mb-3">
                  {humorousMessage}
                </p>
                <div className="flex items-center justify-center gap-4 sm:gap-6 text-sm sm:text-base mb-4">
                  <div className="flex items-center gap-2">
                    <Trophy className="h-4 w-4 sm:h-5 sm:w-5 text-neon-cyan" />
                    <span className="font-semibold text-foreground">{todayScore} pts</span>
                  </div>
                  <div className="text-muted-foreground">
                    {screenshotsFound}/10 {t('game.screenshots')}
                  </div>
                </div>

                {/* Countdown timer.
                    `role="timer"` + `aria-live="polite"` lets assistive tech
                    announce the countdown without interrupting; `aria-atomic`
                    re-reads the whole label rather than a stray digit. */}
                <div
                  role="timer"
                  aria-live="polite"
                  aria-atomic="true"
                  aria-label={`${t('home.nextDailyIn')} ${String(timeRemaining.hours).padStart(2, '0')}:${String(timeRemaining.minutes).padStart(2, '0')}:${String(timeRemaining.seconds).padStart(2, '0')}`}
                  className="flex items-center justify-center gap-2 pt-3 border-t border-neon-purple/20"
                >
                  <Clock className="h-4 w-4 text-neon-pink" aria-hidden="true" />
                  <span className="text-xs sm:text-sm text-muted-foreground">
                    {t('home.nextDailyIn')}
                  </span>
                  <span className="font-mono font-semibold text-foreground text-sm sm:text-base">
                    {String(timeRemaining.hours).padStart(2, '0')}:
                    {String(timeRemaining.minutes).padStart(2, '0')}:
                    {String(timeRemaining.seconds).padStart(2, '0')}
                  </span>
                </div>
              </div>
              <p className="text-xs sm:text-sm text-muted-foreground">
                {t('home.comeBackTomorrow')}
              </p>
            </div>
          )}

          {/* Show appropriate button based on completion status */}
          {!isLoading && (
            <div className="flex flex-col items-center gap-3 sm:gap-4 w-full sm:w-auto">
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-3 sm:gap-4 w-full sm:w-auto">
                {isTodayCompleted ? (
                  <Button
                    variant="outline"
                    size="xl"
                    onClick={() => navigate(localizedPath('/history'))}
                    className="gap-2 sm:gap-3 text-sm sm:text-base md:text-lg px-6 sm:px-8 md:px-10 lg:px-12 w-full sm:w-auto"
                  >
                    <History className="h-4 w-4 sm:h-5 sm:w-5 md:h-6 md:w-6" />
                    {t('common.history')}
                  </Button>
                ) : (
                  <Button
                    variant="gaming"
                    size="xl"
                    disabled={!isOnline}
                    onClick={() => navigate(localizedPath('/play'))}
                    className="gap-2 sm:gap-3 text-sm sm:text-base md:text-lg px-6 sm:px-8 md:px-10 lg:px-12 w-full sm:w-auto"
                  >
                    <Play className="h-4 w-4 sm:h-5 sm:w-5 md:h-6 md:w-6" />
                    {t('home.dailyGuess')}
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="xl"
                  onClick={() => navigate(localizedPath('/geo'))}
                  className="gap-2 sm:gap-3 text-sm sm:text-base md:text-lg px-6 sm:px-8 md:px-10 lg:px-12 w-full sm:w-auto border-neon-pink/40 text-neon-pink hover:border-neon-pink hover:text-neon-pink"
                >
                  <MapPin className="h-4 w-4 sm:h-5 sm:w-5 md:h-6 md:w-6" />
                  {t('home.geoCta')}
                  <Badge
                    variant="outline"
                    className="ml-1 h-5 px-1.5 text-[10px] font-semibold uppercase tracking-wide border-neon-pink/50 text-neon-pink"
                  >
                    {t('common.alpha')}
                  </Badge>
                </Button>
              </div>
              {!isTodayCompleted && !session && (
                <p className="text-xs sm:text-sm text-muted-foreground">
                  {t('home.guestHint')}
                </p>
              )}
              {!isTodayCompleted && !isOnline && (
                <p className="text-xs sm:text-sm text-warning">
                  {t('home.offlineHint')}
                </p>
              )}
            </div>
          )}

          {/* Public teaser — renders today's first screenshot for anonymous visitors */}
          {!isLoading && !session && previewAvailable && !isTodayCompleted && (
            <motion.button
              type="button"
              onClick={() => navigate(localizedPath('/play'))}
              {...motionProps({
                initial: { opacity: 0, y: 10 },
                animate: { opacity: 1, y: 0 },
                transition: { delay: 0.2 },
              })}
              className="mt-6 block w-full max-w-xl overflow-hidden rounded-xl border border-neon-purple/30 bg-card/60 backdrop-blur-sm hover:border-neon-pink/60 transition-colors text-left"
            >
              <div className="relative aspect-video w-full overflow-hidden bg-black/40">
                <img
                  src="/api/game/preview/image"
                  alt={t('home.previewAlt')}
                  loading="lazy"
                  decoding="async"
                  width={1280}
                  height={720}
                  className="w-full h-full object-cover transition-transform hover:scale-105"
                />
                <div className="absolute inset-0 bg-linear-to-t from-black/70 via-transparent" />
                <span className="absolute top-3 left-3 text-[10px] uppercase tracking-wide font-semibold text-white bg-black/60 rounded px-2 py-1">
                  {t('home.previewBadge')}
                </span>
                <div className="absolute bottom-3 left-3 right-3">
                  <p className="text-sm sm:text-base font-semibold text-white">
                    {t('home.previewHeading')}
                  </p>
                  <p className="text-xs text-white/80 mt-1">{t('home.previewSubtitle')}</p>
                </div>
              </div>
            </motion.button>
          )}

          {/* Show yesterday's challenge option if available and not played */}
          {!isLoading && yesterdayChallenge && !yesterdayChallenge.hasPlayed && (
            <motion.div
              {...motionProps({
                initial: { opacity: 0, y: 10 },
                animate: { opacity: 1, y: 0 },
                transition: { delay: 0.2 },
              })}
              className="mt-4 text-center"
            >
              <p className="text-xs sm:text-sm text-muted-foreground mb-2">
                {t('home.missedYesterday')}
              </p>
              <Button
                variant="outline"
                size="lg"
                onClick={() => navigate(localizedPath(`/play?date=${yesterdayChallenge.date}`))}
                className="gap-2 text-sm"
              >
                <CalendarDays className="h-4 w-4" />
                {t('home.playYesterday')}
              </Button>
              <p className="text-xs text-muted-foreground mt-2 opacity-70">
                {t('home.catchUpNote')}
              </p>
            </motion.div>
          )}
        </motion.div>

        {/* Premium teaser — surfaces subscriptions now that paid features
            are live. Hidden once the visitor already has Premium so we don't
            nag paying users. Falls back to "show" for anonymous visitors
            since the entitlement store treats 401 as the free tier. */}
        {showPremiumTeaser && (
          <motion.div
            {...motionProps({
              initial: { opacity: 0, y: 20 },
              animate: { opacity: 1, y: 0 },
              transition: { duration: 0.5, delay: 0.5 },
            })}
            className="max-w-2xl mx-auto mb-8 sm:mb-10 md:mb-12"
          >
            <Link
              to={localizedPath('/premium')}
              className="group relative block overflow-hidden rounded-2xl border border-neon-pink/40 bg-linear-to-br from-neon-pink/20 via-background/60 to-neon-purple/20 backdrop-blur-sm transition-colors hover:border-neon-pink/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neon-pink focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              <div
                aria-hidden="true"
                className="pointer-events-none absolute -top-16 -left-16 h-40 w-40 rounded-full bg-neon-pink/30 blur-3xl opacity-60 group-hover:opacity-80 transition-opacity"
              />
              <div
                aria-hidden="true"
                className="pointer-events-none absolute -bottom-20 -right-10 h-40 w-40 rounded-full bg-neon-purple/30 blur-3xl opacity-60 group-hover:opacity-80 transition-opacity"
              />

              <div className="relative flex flex-col sm:flex-row items-start sm:items-center gap-4 sm:gap-5 p-5 sm:p-6">
                <GradientIcon
                  icon={<Sparkles className="h-6 w-6 sm:h-7 sm:w-7 text-white" />}
                  className="shrink-0 h-12 w-12 sm:h-14 sm:w-14"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-1.5">
                    <Badge
                      variant="outline"
                      className="border-neon-pink/50 bg-neon-pink/15 text-neon-pink uppercase tracking-wider"
                    >
                      {t('home.premium.badge')}
                    </Badge>
                    <span className="text-[11px] sm:text-xs uppercase tracking-wide font-semibold text-muted-foreground">
                      {t('home.premium.eyebrow')}
                    </span>
                  </div>
                  <h2 className="text-lg sm:text-xl md:text-2xl font-bold leading-tight gradient-gaming bg-clip-text text-transparent">
                    {t('home.premium.title')}
                  </h2>
                  <p className="mt-1.5 text-xs sm:text-sm text-muted-foreground max-w-xl">
                    {t('home.premium.subtitle')}
                  </p>
                  {monthlyPriceLabel && (
                    <p className="mt-2 text-sm sm:text-base font-semibold text-neon-pink">
                      {t('home.premium.priceFrom', { price: monthlyPriceLabel })}
                    </p>
                  )}
                  <ul className="mt-3 grid gap-1.5 text-xs sm:text-sm text-foreground/90">
                    {[
                      t('home.premium.perkArchive'),
                      t('home.premium.perkHints'),
                      t('home.premium.perkCosmetics'),
                    ].map((perk) => (
                      <li key={perk} className="flex items-start gap-2">
                        <Check className="h-4 w-4 mt-0.5 shrink-0 text-neon-pink" aria-hidden="true" />
                        <span>{perk}</span>
                      </li>
                    ))}
                  </ul>
                  <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-foreground group-hover:text-neon-pink transition-colors">
                    {t('home.premium.cta')}
                    <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                  </span>
                </div>
              </div>
            </Link>
          </motion.div>
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
