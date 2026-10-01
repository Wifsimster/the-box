import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { m, type MotionProps } from 'framer-motion'
import { Play, Trophy, History, Clock, CalendarDays, WifiOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useLocalizedPath } from '@/hooks/useLocalizedPath'

interface YesterdayChallenge {
  challengeId: number
  date: string
  hasPlayed: boolean
  isCompleted?: boolean
}

interface TimeRemaining {
  hours: number
  minutes: number
  seconds: number
}

/**
 * The home page's daily-challenge call-to-action block: completion card +
 * countdown, primary play/history buttons, the anonymous-visitor preview
 * teaser and the "missed yesterday" catch-up prompt. Extracted from
 * HomePage to keep that component focused on orchestration.
 */
export interface HomeDailyCtaStatus {
  isLoading: boolean
  isTodayCompleted: boolean
  isOnline: boolean
  hasSession: boolean
  previewAvailable: boolean
}

const pad = (value: number) => String(value).padStart(2, '0')

export function HomeDailyCta({
  status,
  todayScore,
  screenshotsFound,
  humorousMessage,
  timeRemaining,
  yesterdayChallenge,
  motionProps,
}: {
  status: HomeDailyCtaStatus
  todayScore: number
  screenshotsFound: number
  humorousMessage: string
  timeRemaining: TimeRemaining
  yesterdayChallenge: YesterdayChallenge | null
  motionProps: (props: MotionProps) => MotionProps
}) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { localizedPath } = useLocalizedPath()
  const { isLoading, isTodayCompleted, isOnline, hasSession, previewAvailable } = status

  const countdown = `${pad(timeRemaining.hours)}:${pad(timeRemaining.minutes)}:${pad(timeRemaining.seconds)}`

  if (isLoading) {
    return (
      <div aria-busy="true" className="flex flex-col items-center gap-3">
        <Skeleton className="h-14 w-full rounded-lg sm:w-80" />
        <Skeleton className="h-4 w-56 max-w-full" variant="text" />
      </div>
    )
  }

  return (
    <m.div
      {...motionProps({
        initial: { opacity: 0, scale: 0.96 },
        animate: { opacity: 1, scale: 1 },
        transition: { duration: 0.4, delay: 0.2 },
      })}
      className="mx-auto flex w-full max-w-xl flex-col items-center gap-4"
    >
      {isTodayCompleted && (
        <Card variant="neon" className="w-full bg-card/80 text-center backdrop-blur-sm">
          <CardContent className="space-y-3 pt-(--card-padding)">
            <p className="text-lg font-bold text-foreground sm:text-xl">{humorousMessage}</p>
            <div className="flex items-center justify-center gap-4 text-sm sm:gap-6 sm:text-base">
              <div className="flex items-center gap-2">
                <Trophy className="size-4 text-neon-cyan sm:size-5" aria-hidden="true" />
                <span className="font-semibold text-foreground">{todayScore} pts</span>
              </div>
              <div className="text-muted-foreground">
                {screenshotsFound}/10 {t('game.screenshots')}
              </div>
            </div>

            {/* `role="timer"` is implicitly `aria-live="off"`: announcing a
                value that changes every second would flood screen readers. */}
            <div
              role="timer"
              aria-label={`${t('home.nextDailyIn')} ${countdown}`}
              className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 border-t border-border pt-3"
            >
              <Clock className="size-4 text-neon-pink" aria-hidden="true" />
              <span className="text-sm text-muted-foreground">{t('home.nextDailyIn')}</span>
              <span className="font-mono text-base font-semibold tabular-nums text-foreground" aria-hidden="true">
                {countdown}
              </span>
            </div>
            <p className="text-sm text-muted-foreground">{t('home.comeBackTomorrow')}</p>
          </CardContent>
        </Card>
      )}

      <div className="flex w-full flex-col items-center gap-3 sm:w-auto">
        {isTodayCompleted ? (
          <Button
            variant="outline"
            size="xl"
            onClick={() => navigate(localizedPath('/history'))}
            className="w-full gap-3 sm:w-auto"
          >
            <History className="size-5" aria-hidden="true" />
            {t('common.history')}
          </Button>
        ) : (
          <Button
            variant="gaming"
            size="xl"
            disabled={!isOnline}
            onClick={() => navigate(localizedPath('/play'))}
            data-tour="play-cta"
            className="w-full gap-3 sm:w-auto sm:px-12"
          >
            <Play className="size-5" aria-hidden="true" />
            {t('home.playToday')}
          </Button>
        )}
        {!isTodayCompleted && !isOnline ? (
          <p role="status" className="flex items-center gap-2 text-center text-sm text-warning">
            <WifiOff className="size-4 shrink-0" aria-hidden="true" />
            {t('home.offlineHint')}
          </p>
        ) : (
          !isTodayCompleted && !hasSession && (
            <p className="text-center text-sm text-muted-foreground">{t('home.guestHint')}</p>
          )
        )}
      </div>

      {/* Public teaser — renders today's first screenshot for anonymous visitors */}
      {!hasSession && previewAvailable && !isTodayCompleted && (
        <button
          type="button"
          onClick={() => navigate(localizedPath('/play'))}
          disabled={!isOnline}
          className="group mt-2 block w-full overflow-hidden rounded-xl border border-neon-purple/30 bg-card/60 text-left backdrop-blur-sm transition-colors hover:border-neon-pink/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-60"
        >
          <div className="relative aspect-video w-full overflow-hidden bg-muted">
            <img
              src="/api/game/preview/image"
              alt={t('home.previewAlt')}
              loading="lazy"
              decoding="async"
              width={1280}
              height={720}
              className="size-full object-cover transition-transform motion-safe:group-hover:scale-105"
            />
            <div className="absolute inset-0 bg-linear-to-t from-black/75 via-black/10 to-transparent" />
            <span className="absolute left-3 top-3 rounded bg-black/60 px-2 py-1 text-xs font-semibold uppercase tracking-wide text-white">
              {t('home.previewBadge')}
            </span>
            <div className="absolute inset-x-3 bottom-3">
              <p className="text-base font-semibold text-white">{t('home.previewHeading')}</p>
              <p className="mt-1 text-sm text-white/85">{t('home.previewSubtitle')}</p>
            </div>
          </div>
        </button>
      )}

      {yesterdayChallenge && !yesterdayChallenge.hasPlayed && (
        <div className="mt-2 flex w-full flex-col items-center gap-2 text-center">
          <p className="text-sm text-muted-foreground">{t('home.missedYesterday')}</p>
          <Button
            variant="outline"
            onClick={() => navigate(localizedPath(`/play?date=${yesterdayChallenge.date}`))}
            disabled={!isOnline}
            className="w-full gap-2 sm:w-auto"
          >
            <CalendarDays className="size-4" aria-hidden="true" />
            {t('home.playYesterday')}
          </Button>
          <p className="text-xs text-muted-foreground">{t('home.catchUpNote')}</p>
        </div>
      )}
    </m.div>
  )
}
