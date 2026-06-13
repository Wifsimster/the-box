import { useTranslation } from 'react-i18next'
import { m } from 'framer-motion'
import { Link } from 'react-router-dom'
import { CheckCircle2, Clock, Trophy, Home, History } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useLocalizedPath } from '@/hooks/useLocalizedPath'

interface TimeRemaining {
  hours: number
  minutes: number
  seconds: number
}

/**
 * Error / "already completed today" state for the daily game. Renders the
 * celebratory completion card when the error indicates today's challenge is
 * done, otherwise a generic error with retry. Extracted from GamePage to
 * keep that component focused on game-loop orchestration.
 */
export function GameErrorState({
  error,
  timeRemaining,
  hasSession,
}: {
  error: string
  timeRemaining: TimeRemaining
  hasSession: boolean
}) {
  const { t } = useTranslation()
  const { localizedPath } = useLocalizedPath()
  const isAlreadyCompleted = error.includes(t('game.alreadyCompleted'))

  return (
    <m.div
      key="error"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="flex flex-col items-center justify-center size-full px-4 sm:px-6"
    >
      {isAlreadyCompleted ? (
        <m.div
          initial={{ opacity: 0, y: 12, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.35, ease: 'easeOut' }}
          className="relative w-full max-w-md mx-auto"
        >
          {/* Ambient neon glow */}
          <div
            aria-hidden="true"
            className="absolute -inset-px rounded-2xl bg-linear-to-br from-neon-purple/20 via-transparent to-neon-pink/20 blur-2xl"
          />
          <div className="relative bg-card/80 backdrop-blur-xl border border-neon-purple/30 rounded-2xl p-6 sm:p-8 shadow-2xl">
            <div className="flex flex-col items-center text-center">
              <div className="relative mb-4">
                <div className="absolute inset-0 rounded-full bg-neon-purple/30 blur-xl" aria-hidden="true" />
                <div className="relative flex items-center justify-center size-16 sm:size-20 rounded-full bg-linear-to-br from-neon-purple to-neon-pink">
                  <CheckCircle2 className="size-8 sm:size-10 text-white" />
                </div>
              </div>

              <h2 className="text-xl sm:text-2xl font-bold text-foreground mb-2">
                {t('home.todayCompleted')}
              </h2>
              <p className="text-sm sm:text-base text-muted-foreground mb-5 max-w-sm">
                {t('home.comeBackTomorrow')}
              </p>

              <div
                role="timer"
                aria-live="polite"
                aria-atomic="true"
                aria-label={`${t('home.nextDailyIn')} ${String(timeRemaining.hours).padStart(2, '0')}:${String(timeRemaining.minutes).padStart(2, '0')}:${String(timeRemaining.seconds).padStart(2, '0')}`}
                className="w-full flex items-center justify-center gap-2 sm:gap-3 px-4 py-3 rounded-xl bg-background/60 border border-neon-purple/20 mb-6"
              >
                <Clock className="size-4 sm:size-5 text-neon-pink" aria-hidden="true" />
                <span className="text-xs sm:text-sm text-muted-foreground">
                  {t('home.nextDailyIn')}
                </span>
                <span className="font-mono font-semibold text-foreground text-sm sm:text-base tabular-nums">
                  {String(timeRemaining.hours).padStart(2, '0')}:
                  {String(timeRemaining.minutes).padStart(2, '0')}:
                  {String(timeRemaining.seconds).padStart(2, '0')}
                </span>
              </div>

              <div className="flex flex-col gap-2 sm:gap-3 w-full">
                <Button variant="gaming" asChild className="w-full">
                  <Link to={localizedPath('/results')}>
                    <Trophy className="size-4 mr-2" />
                    {t('game.completionChoice.seeResults')}
                  </Link>
                </Button>
                <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 w-full">
                  <Button variant="outline" asChild className="flex-1">
                    <Link to={localizedPath('/')}>
                      <Home className="size-4 mr-2" />
                      {t('common.home')}
                    </Link>
                  </Button>
                  {hasSession && (
                    <Button variant="outline" asChild className="flex-1">
                      <Link to={localizedPath('/history')}>
                        <History className="size-4 mr-2" />
                        {t('common.history')}
                      </Link>
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </m.div>
      ) : (
        <div className="flex flex-col items-center gap-4 max-w-md text-center">
          <p className="text-destructive">{error}</p>
          <div className="flex flex-wrap gap-3 justify-center">
            <Button variant="gaming" asChild>
              <Link to={localizedPath('/')}>
                <Home className="size-4 mr-2" />
                {t('common.home')}
              </Link>
            </Button>
            <Button variant="outline" onClick={() => window.location.reload()}>
              {t('common.retry')}
            </Button>
          </div>
        </div>
      )}
    </m.div>
  )
}
