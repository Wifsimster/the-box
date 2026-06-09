import { useTranslation } from 'react-i18next'
import { m } from 'framer-motion'
import { CheckCircle, XCircle, Clock } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { calculateSpeedMultiplier, formatDiscoveryTime } from '@/lib/utils'
import { GuessAttemptsList } from '@/components/game/GuessAttemptsList'
import type { GuessResult } from '@/types'

/**
 * Per-screenshot results breakdown for a finished game session. This is the
 * single, canonical list rendering shared by every session-detail surface —
 * the post-game results page, the game-history details page, and the
 * leaderboard answers dialog — so they never drift apart again.
 *
 * Each row shows the screenshot thumbnail, the (revealed) game name, the
 * score badge, every guess attempt, and — for correct guesses — the discovery
 * time and speed multiplier. Unfound games render with the miss styling.
 */
export function SessionResultsList({
  results,
  totalScreenshots,
  reducedMotion = false,
  columns = 1,
}: {
  results: GuessResult[]
  totalScreenshots: number
  reducedMotion?: boolean
  /** Lay the rows out in two balanced columns on wider screens (≥ md). */
  columns?: 1 | 2
}) {
  const { t } = useTranslation()
  // Multi-column relies on CSS columns; framer's per-item x-transform can
  // confuse `break-inside-avoid`, so the slide-in is dropped in that mode.
  const isGrid = columns === 2
  const animate = !reducedMotion && !isGrid
  return (
    <ul className={isGrid ? 'list-none gap-4 md:columns-2' : 'space-y-2 sm:space-y-3 list-none'}>
      {results.map((result, index) => {
        const isUnguessed =
          !result.isCorrect && result.userGuess === null && result.scoreEarned === -50
        const attempts = result.attempts ?? []
        const multiplier =
          result.isCorrect && result.scoreEarned > 0
            ? calculateSpeedMultiplier(result.timeTakenMs)
            : 1
        return (
          <m.li
            key={result.position}
            initial={animate ? { opacity: 0, x: -20 } : false}
            animate={animate ? { opacity: 1, x: 0 } : undefined}
            transition={animate ? { duration: 0.3, delay: index * 0.05 } : undefined}
            className={`flex items-start gap-2 sm:gap-3 p-2.5 sm:p-3 rounded-lg ${isGrid ? 'break-inside-avoid mb-4' : ''} ${isUnguessed ? 'bg-destructive/10 border border-destructive/20' : 'bg-secondary/50'
              }`}
          >
            <span className="text-muted-foreground text-sm sm:text-base w-5 sm:w-6 shrink-0 pt-0.5" aria-hidden="true">{result.position}.</span>
            {result.isCorrect ? (
              <CheckCircle className="size-4 sm:size-5 text-success shrink-0 mt-1" aria-hidden="true" />
            ) : (
              <XCircle className="size-4 sm:size-5 text-error shrink-0 mt-1" aria-hidden="true" />
            )}
            {result.screenshot && (
              <div className="size-12 sm:size-16 rounded overflow-hidden shrink-0">
                <img
                  src={result.screenshot.thumbnailUrl || result.screenshot.imageUrl}
                  alt={t('game.screenshotOf', { game: result.correctGame.name })}
                  className="size-full object-cover"
                  loading="lazy"
                />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2">
                <span className="font-medium text-sm sm:text-base block truncate">{result.correctGame.name}</span>
                {result.isCorrect && result.scoreEarned > 0 ? (
                  <Badge variant="success" className="text-xs sm:text-sm font-bold shrink-0">
                    +{result.scoreEarned}
                  </Badge>
                ) : isUnguessed ? (
                  <Badge variant="destructive" className="text-xs sm:text-sm font-bold shrink-0">
                    {result.scoreEarned}
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-xs sm:text-sm shrink-0">
                    +{result.scoreEarned}
                  </Badge>
                )}
              </div>
              {isUnguessed && attempts.length === 0 && (
                <span className="text-xs sm:text-sm text-destructive block mt-0.5">
                  {t('game.notFound')}
                </span>
              )}
              {attempts.length > 0 && (
                <>
                  <span className="text-xs text-muted-foreground block mt-0.5">
                    {t('game.attempts.count', { count: attempts.length })}
                  </span>
                  <GuessAttemptsList attempts={attempts} />
                </>
              )}
              {result.isCorrect && result.timeTakenMs > 0 && (
                <div className="flex items-center gap-1 sm:gap-1.5 text-xs text-muted-foreground mt-1">
                  <Clock className="size-3 sm:size-3.5 shrink-0" aria-hidden="true" />
                  <span className="whitespace-nowrap">
                    {t('game.discoveryTime', { time: formatDiscoveryTime(result.timeTakenMs) })}
                    {result.scoreEarned > 0 && multiplier > 1.0 && (
                      <> · 100 × {multiplier.toFixed(1)}x {t('game.speed.label')}</>
                    )}
                  </span>
                </div>
              )}
            </div>
          </m.li>
        )
      })}

      {results.length === 0 && totalScreenshots === 0 && (
        <p className="text-center text-muted-foreground py-6 sm:py-8 text-sm sm:text-base">
          {t('game.noResults')}
        </p>
      )}
    </ul>
  )
}
