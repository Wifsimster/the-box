import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { m, type MotionProps } from 'framer-motion'
import { Play, Trophy, History, Clock, CalendarDays, MapPin } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useLocalizedPath } from '@/hooks/useLocalizedPath'
import { useFeatures } from '@/hooks/useFeatures'

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
  const { geoCommunity } = useFeatures()
  const { isLoading, isTodayCompleted, isOnline, hasSession, previewAvailable } = status

  return (
    <m.div
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
                <Trophy className="size-4 sm:size-5 text-neon-cyan" />
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
              <Clock className="size-4 text-neon-pink" aria-hidden="true" />
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

      {/* Show appropriate button based on completion status.
          One loud primary action (play / history) so visitors have a single
          obvious next step; Geo mode is demoted to a quiet secondary link
          below rather than competing as an equal-weight button. */}
      {!isLoading && (
        <div className="flex flex-col items-center gap-3 sm:gap-4 w-full sm:w-auto">
          <div className="flex justify-center w-full sm:w-auto">
            {isTodayCompleted ? (
              <Button
                variant="outline"
                size="xl"
                onClick={() => navigate(localizedPath('/history'))}
                className="gap-2 sm:gap-3 text-sm sm:text-base md:text-lg px-6 sm:px-8 md:px-10 lg:px-12 w-full sm:w-auto"
              >
                <History className="size-4 sm:size-5 md:size-6" />
                {t('common.history')}
              </Button>
            ) : (
              <Button
                variant="gaming"
                size="xl"
                disabled={!isOnline}
                onClick={() => navigate(localizedPath('/play'))}
                data-tour="play-cta"
                className="gap-2 sm:gap-3 text-sm sm:text-base md:text-lg px-6 sm:px-8 md:px-10 lg:px-12 w-full sm:w-auto"
              >
                <Play className="size-4 sm:size-5 md:size-6" />
                {t('home.dailyGuess')}
              </Button>
            )}
          </div>
          {geoCommunity && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate(localizedPath('/geo'))}
              data-tour="geo-cta"
              className="gap-1.5 text-xs sm:text-sm text-muted-foreground hover:text-neon-pink"
            >
              <MapPin className="size-4" />
              {t('home.geoCta')}
              <Badge
                variant="outline"
                className="ml-1 h-4 px-1 text-[9px] font-semibold uppercase tracking-wide border-neon-pink/40 text-neon-pink"
              >
                {t('common.alpha')}
              </Badge>
            </Button>
          )}
          {!isTodayCompleted && !hasSession && (
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
      {!isLoading && !hasSession && previewAvailable && !isTodayCompleted && (
        <m.button
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
              className="size-full object-cover transition-transform hover:scale-105"
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
        </m.button>
      )}

      {/* Show yesterday's challenge option if available and not played */}
      {!isLoading && yesterdayChallenge && !yesterdayChallenge.hasPlayed && (
        <m.div
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
            <CalendarDays className="size-4" />
            {t('home.playYesterday')}
          </Button>
          <p className="text-xs text-muted-foreground mt-2 opacity-70">
            {t('home.catchUpNote')}
          </p>
        </m.div>
      )}
    </m.div>
  )
}
