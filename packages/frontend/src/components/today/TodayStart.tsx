import { m } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import { Flame, Info, Play, WifiOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useReducedMotionSafe } from '@/hooks/useReducedMotionSafe'

/** Today's first screenshot, served publicly for the blurred teaser. */
const TODAY_PREVIEW_IMAGE = '/api/game/preview/image'

interface TodayStartProps {
  date: string
  totalScreenshots: number
  isAuthenticated: boolean
  isOnline: boolean
  isStarting: boolean
  /** Catch-up of a past box (`/play?date=`): no preview, no leaderboard. */
  isCatchUp?: boolean
  /** Active streak for signed-in players; null hides the chip. */
  streak?: number | null
  onStart: () => void
}

/**
 * The closed box: the one screen between opening the site and the first
 * screenshot (decision D1). Today's first screenshot is shown blurred behind a
 * single button; the tap starts the session, and the screenshot appears sharp
 * in place with its 45 s clock running. The blur keeps the clock fair: nobody
 * gets to study screenshot 1 before the timer starts.
 *
 * Replaces the former intro screen on `/play` too, where it also opens
 * catch-up boxes (`?date=`) — without the preview, which is always today's.
 */
export function TodayStart({
  date,
  totalScreenshots,
  isAuthenticated,
  isOnline,
  isStarting,
  isCatchUp = false,
  streak = null,
  onStart,
}: TodayStartProps) {
  const { t, i18n } = useTranslation()
  const reducedMotion = useReducedMotionSafe()

  const formattedDate = new Date(`${date}T00:00:00Z`).toLocaleDateString(i18n.language, {
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  })
  const showPreview = !isCatchUp

  let hint = isAuthenticated ? t('today.startHint') : t('today.guestHint')
  if (isCatchUp) hint = t('game.catchUpNotice')

  return (
    <m.section
      aria-labelledby="today-title"
      initial={reducedMotion ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={reducedMotion ? undefined : { opacity: 0 }}
      className="relative flex size-full flex-col items-center justify-center overflow-y-auto px-4 py-6"
    >
      {/* Soft ambient wash from the same screenshot. */}
      {showPreview && (
        <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden" aria-hidden="true">
          <img
            src={TODAY_PREVIEW_IMAGE}
            alt=""
            data-keep-blur
            decoding="async"
            className="size-full scale-110 object-cover opacity-25 blur-3xl"
          />
        </div>
      )}

      <div className="relative z-10 flex w-full max-w-xl flex-col items-center gap-4 text-center sm:gap-5">
        <div className="space-y-1">
          <h1 id="today-title" className="gradient-gaming-title text-3xl font-bold sm:text-4xl">
            {t('today.boxOf', { date: formattedDate })}
          </h1>
          <p className="text-sm text-muted-foreground sm:text-base">
            {t('today.rules', { count: totalScreenshots })}
          </p>
        </div>

        {/* The first screenshot, blurred: the box is right here, and the
            clock only starts once the player opens it. Hovering lifts the
            veil a little (less blur, lighter tint) as a tease; it stays far
            too blurred to read, so the clock remains fair. */}
        <div
          data-testid="today-box-preview"
          aria-hidden="true"
          className="group relative aspect-video w-full overflow-hidden rounded-xl border border-neon-purple/40 bg-muted shadow-cta transition-colors duration-300 hover:border-neon-pink/60"
        >
          {showPreview && (
            <img
              src={TODAY_PREVIEW_IMAGE}
              alt=""
              data-keep-blur
              decoding="async"
              width={1280}
              height={720}
              className="size-full scale-110 object-cover blur-xl transition-[filter,transform] duration-500 ease-[cubic-bezier(0.23,1,0.32,1)] group-hover:scale-105 group-hover:blur-md"
            />
          )}
          <span className="absolute inset-0 flex items-center justify-center bg-background/30 transition-colors duration-500 ease-[cubic-bezier(0.23,1,0.32,1)] group-hover:bg-background/15">
            <img
              src="/logo-open.svg"
              alt=""
              className="size-16 drop-shadow-lg transition-opacity duration-500 group-hover:opacity-70 sm:size-20"
            />
          </span>
        </div>

        {streak !== null && streak > 0 && (
          <p className="inline-flex items-center gap-2 rounded-full border border-neon-pink/40 bg-card/70 px-3 py-1 text-sm font-semibold text-foreground backdrop-blur-sm">
            <Flame className="size-4 text-neon-pink" aria-hidden="true" />
            {t('today.streak', { count: streak })}
          </p>
        )}

        <Button
          variant="gaming"
          size="xl"
          data-testid="today-open-box"
          onClick={onStart}
          disabled={!isOnline || isStarting}
          aria-busy={isStarting}
          className="w-full gap-3 sm:w-auto sm:px-12"
        >
          <Play className="size-5" aria-hidden="true" />
          {isCatchUp ? t('today.openCatchUp') : t('home.playToday')}
        </Button>

        {!isOnline ? (
          <p role="status" className="flex items-center gap-2 text-sm text-warning">
            <WifiOff className="size-4 shrink-0" aria-hidden="true" />
            {t('home.offlineHint')}
          </p>
        ) : (
          <p className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
            {isCatchUp && <Info className="size-4 shrink-0 text-neon-blue" aria-hidden="true" />}
            {hint}
          </p>
        )}
      </div>
    </m.section>
  )
}
