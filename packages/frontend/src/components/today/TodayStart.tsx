import { m } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import { Flame, Play, WifiOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useReducedMotionSafe } from '@/hooks/useReducedMotionSafe'

interface TodayStartProps {
  date: string
  totalScreenshots: number
  isAuthenticated: boolean
  isOnline: boolean
  isStarting: boolean
  /** Active streak for signed-in players; null hides the chip. */
  streak: number | null
  onStart: () => void
}

/**
 * First screen of the daily-first home: today's first screenshot, blurred,
 * behind one button. The blur keeps the 45 s clock fair — the screenshot only
 * sharpens (and the clock only starts) once the player opens the box.
 */
export function TodayStart({
  date,
  totalScreenshots,
  isAuthenticated,
  isOnline,
  isStarting,
  streak,
  onStart,
}: TodayStartProps) {
  const { t, i18n } = useTranslation()
  const reducedMotion = useReducedMotionSafe()

  const formattedDate = new Date(`${date}T00:00:00Z`).toLocaleDateString(i18n.language, {
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  })

  return (
    <m.section
      aria-labelledby="today-title"
      initial={reducedMotion ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={reducedMotion ? undefined : { opacity: 0 }}
      className="relative flex size-full flex-col items-center justify-center overflow-hidden px-4"
    >
      {/* Soft ambient wash from the same screenshot. */}
      <div className="absolute inset-0 z-0" aria-hidden="true">
        <img
          src="/api/game/preview/image"
          alt=""
          decoding="async"
          className="size-full scale-110 object-cover opacity-25 blur-3xl"
        />
      </div>

      <div className="relative z-10 flex w-full max-w-xl flex-col items-center gap-4 text-center sm:gap-5">
        <div className="space-y-1">
          <h1 id="today-title" className="gradient-gaming-title text-3xl font-bold sm:text-4xl">
            {t('today.boxOf', { date: formattedDate })}
          </h1>
          <p className="text-sm text-muted-foreground sm:text-base">
            {t('today.rules', { count: totalScreenshots })}
          </p>
        </div>

        {/* Today's first screenshot, blurred: the box is right here, and the
            clock only starts once the player opens it. */}
        <div
          aria-hidden="true"
          className="relative aspect-video w-full overflow-hidden rounded-xl border border-neon-purple/40 bg-muted shadow-cta"
        >
          <img
            src="/api/game/preview/image"
            alt=""
            decoding="async"
            width={1280}
            height={720}
            className="size-full scale-110 object-cover blur-md"
          />
          <span className="absolute inset-0 flex items-center justify-center bg-background/30">
            <img src="/logo-open.svg" alt="" className="size-16 drop-shadow-lg sm:size-20" />
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
          onClick={onStart}
          disabled={!isOnline || isStarting}
          className="w-full gap-3 sm:w-auto sm:px-12"
        >
          <Play className="size-5" aria-hidden="true" />
          {t('home.playToday')}
        </Button>

        {!isOnline ? (
          <p role="status" className="flex items-center gap-2 text-sm text-warning">
            <WifiOff className="size-4 shrink-0" aria-hidden="true" />
            {t('home.offlineHint')}
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">
            {isAuthenticated ? t('today.startHint') : t('today.guestHint')}
          </p>
        )}
      </div>
    </m.section>
  )
}
