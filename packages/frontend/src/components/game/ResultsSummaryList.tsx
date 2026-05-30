import { useTranslation } from 'react-i18next'
import { m } from 'framer-motion'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { CheckCircle, XCircle, Clock } from 'lucide-react'
import { GuessAttemptsList } from '@/components/game/GuessAttemptsList'
import { calculateSpeedMultiplier, formatDiscoveryTime } from '@/lib/utils'
import type { GuessResult } from '@/types'

function ResultRow({
  result,
  index,
  compact,
}: {
  result: GuessResult
  index: number
  compact: boolean
}) {
  const { t } = useTranslation()
  const isUnguessed =
    !result.isCorrect && result.userGuess === null && result.scoreEarned === -50
  return (
    <m.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.3, delay: index * 0.05 }}
      className={
        compact
          ? `flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 p-2.5 sm:p-3 rounded-lg ${isUnguessed ? 'bg-destructive/10 border border-destructive/20' : 'bg-secondary/50'}`
          : `flex items-center gap-3 p-3 rounded-lg ${isUnguessed ? 'bg-destructive/10 border border-destructive/20' : 'bg-secondary/50'}`
      }
    >
      <div className={compact ? 'flex items-center gap-2 sm:gap-3 flex-1 min-w-0' : 'flex items-center gap-3 flex-1 min-w-0'}>
        <span className={compact ? 'text-muted-foreground text-sm sm:text-base w-5 sm:w-6 shrink-0' : 'text-muted-foreground text-base w-6 shrink-0'}>
          {result.position}.
        </span>
        {result.isCorrect ? (
          <CheckCircle className={compact ? 'size-4 sm:size-5 text-success shrink-0' : 'size-5 text-success shrink-0'} />
        ) : (
          <XCircle className={compact ? 'size-4 sm:size-5 text-error shrink-0' : 'size-5 text-error shrink-0'} />
        )}
        {isUnguessed && result.screenshot && (
          <div className={compact ? 'size-12 sm:size-16 rounded overflow-hidden shrink-0' : 'size-16 rounded overflow-hidden shrink-0'}>
            <img
              src={result.screenshot.thumbnailUrl || result.screenshot.imageUrl}
              alt="Screenshot"
              className="size-full object-cover"
            />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <span className={compact ? 'font-medium text-sm sm:text-base block truncate' : 'font-medium text-base block truncate'}>
            {result.correctGame.name}
          </span>
          {isUnguessed && (!result.attempts || result.attempts.length === 0) && (
            <span className={compact ? 'text-xs sm:text-sm text-destructive block mt-0.5' : 'text-sm text-destructive block mt-0.5'}>
              {t('game.notFound') || 'Not Found'}
            </span>
          )}
          {result.attempts && result.attempts.length > 0 && (
            <>
              <span className="text-xs text-muted-foreground block mt-0.5">
                {t('game.attempts.count', { count: result.attempts.length })}
              </span>
              <GuessAttemptsList attempts={result.attempts} compact={compact} />
            </>
          )}
        </div>
      </div>
      <div className={compact ? 'flex items-center justify-between sm:justify-end sm:text-right gap-2 sm:gap-0' : 'text-right'}>
        {result.isCorrect && result.scoreEarned > 0 ? (
          <div className="flex flex-col items-end gap-1">
            <Badge variant="success" className={compact ? 'text-xs sm:text-sm font-bold' : 'text-sm font-bold'}>
              +{result.scoreEarned}
            </Badge>
            {result.timeTakenMs > 0 && (() => {
              const multiplier = calculateSpeedMultiplier(result.timeTakenMs)
              return (
                <div className={compact ? 'flex items-center gap-1 sm:gap-1.5 text-xs text-muted-foreground' : 'flex items-center gap-1.5 text-xs text-muted-foreground'}>
                  <Clock className={compact ? 'size-3 sm:size-3.5' : 'size-3.5'} />
                  <span className="whitespace-nowrap">
                    {t('game.discoveryTime', { time: formatDiscoveryTime(result.timeTakenMs) })}
                    {multiplier > 1.0 && <> · {multiplier.toFixed(1)}x</>}
                  </span>
                </div>
              )
            })()}
          </div>
        ) : isUnguessed ? (
          <Badge variant="destructive" className={compact ? 'text-xs sm:text-sm font-bold' : 'text-sm font-bold'}>
            {result.scoreEarned}
          </Badge>
        ) : (
          <Badge variant="outline" className={compact ? 'text-xs sm:text-sm' : 'text-sm'}>
            +{result.scoreEarned}
          </Badge>
        )}
      </div>
    </m.div>
  )
}

/**
 * Per-screenshot results breakdown shown on the results screen. Renders a
 * scroll container on mobile and a full list on desktop. Extracted from
 * ResultsPage so that component stays focused on score + share orchestration.
 */
export function ResultsSummaryList({
  results,
  totalScreenshots,
}: {
  results: GuessResult[]
  totalScreenshots: number
}) {
  const { t } = useTranslation()
  const emptyState = results.length === 0 && totalScreenshots === 0
  return (
    <>
      {/* ScrollArea only on mobile, full list on desktop */}
      <div className="md:hidden">
        <ScrollArea className="h-[calc(100vh-500px)]">
          <div className="space-y-2 pr-2">
            {results.map((result, index) => (
              <ResultRow key={result.position} result={result} index={index} compact />
            ))}
            {emptyState && (
              <p className="text-center text-muted-foreground py-6 sm:py-8 text-sm sm:text-base">
                {t('game.noResults')}
              </p>
            )}
          </div>
        </ScrollArea>
      </div>
      {/* Full list on desktop - no scroll */}
      <div className="hidden md:block">
        <div className="space-y-3">
          {results.map((result, index) => (
            <ResultRow key={result.position} result={result} index={index} compact={false} />
          ))}
          {emptyState && (
            <p className="text-center text-muted-foreground py-8 text-base">
              {t('game.noResults')}
            </p>
          )}
        </div>
      </div>
    </>
  )
}
