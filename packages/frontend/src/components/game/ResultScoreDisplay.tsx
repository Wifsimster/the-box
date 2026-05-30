import type { ComponentType } from 'react'
import { m } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import { Clock, Zap, Target } from 'lucide-react'
import { cn, calculateSpeedMultiplier } from '@/lib/utils'

interface SpeedFeedback {
  key: string
  icon: ComponentType<{ className?: string }>
  color: string
}

// Pure: maps elapsed time to the speed-feedback badge. No component state.
function getSpeedFeedback(isCorrect: boolean, timeTakenSeconds: number): SpeedFeedback | null {
  if (!isCorrect) return null
  if (timeTakenSeconds <= 5) return { key: 'lightning', icon: Zap, color: 'text-score-mid' }
  if (timeTakenSeconds <= 15) return { key: 'fast', icon: Clock, color: 'text-score-high' }
  return { key: 'good', icon: Target, color: 'text-neon-blue' }
}

interface ResultScoreDisplayProps {
  isCorrect: boolean
  scoreEarned: number
  scorePercentage: number
  timeTakenMs: number
  timeTakenSeconds: number
  timeDisplay: string
  hintPenalty?: number
  wrongGuessPenalty?: number
}

/**
 * Presentational block for the score: the +100 × multiplier headline (or flat
 * score), hint / wrong-guess penalties, and the speed-feedback badge.
 */
export function ResultScoreDisplay({
  isCorrect,
  scoreEarned,
  scorePercentage,
  timeTakenMs,
  timeTakenSeconds,
  timeDisplay,
  hintPenalty,
  wrongGuessPenalty,
}: ResultScoreDisplayProps) {
  const { t } = useTranslation()
  const speedFeedback = getSpeedFeedback(isCorrect, timeTakenSeconds)

  const scoreColor = cn(
    "text-5xl font-black",
    scorePercentage >= 80
      ? "text-success"
      : scorePercentage >= 50
        ? "text-score-mid"
        : "text-score-low"
  )

  return (
    <m.div
      initial={{ y: 20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ delay: 0.45 }}
      className="text-center mb-6"
    >
      {isCorrect && scoreEarned > 0 ? (
        <div className="flex flex-col items-center gap-1">
          <div className="flex items-center justify-center gap-2">
            <span className={scoreColor}>+100</span>
            <span className="text-5xl font-black text-muted-foreground">×</span>
            <span className={scoreColor}>
              {calculateSpeedMultiplier(timeTakenMs).toFixed(2)}
            </span>
          </div>
          <span className="text-lg text-muted-foreground font-medium">pts</span>
        </div>
      ) : (
        <div className="flex items-center justify-center gap-2">
          <span className="text-5xl font-black text-muted-foreground">
            +{scoreEarned}
          </span>
          <span className="text-lg text-muted-foreground font-medium">pts</span>
        </div>
      )}

      {/* Hint Penalty Display */}
      {hintPenalty && hintPenalty > 0 && isCorrect && (
        <m.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.55 }}
          className="mt-2 text-score-low text-sm font-medium"
        >
          {t('game.hints.penaltyApplied', { penalty: hintPenalty })} ({t('game.hints.percentagePenalty', '20% penalty')})
        </m.div>
      )}

      {/* Wrong Guess Penalty Display */}
      {wrongGuessPenalty && wrongGuessPenalty > 0 && !isCorrect && (
        <m.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.55 }}
          className="mt-2 text-error text-sm font-medium"
        >
          {t('game.wrongGuessPenalty', { penalty: wrongGuessPenalty, defaultValue: `Wrong guess penalty: -${wrongGuessPenalty} pts` })}
        </m.div>
      )}

      {/* Speed feedback for correct answers */}
      {isCorrect && speedFeedback && (
        <m.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.6 }}
          className={cn("flex items-center justify-center gap-1.5 mt-2 text-sm", speedFeedback.color)}
        >
          <speedFeedback.icon className="size-4" />
          <span>{t(`game.speed.${speedFeedback.key}`)}</span>
          <span className="text-muted-foreground">• {timeDisplay}</span>
        </m.div>
      )}
    </m.div>
  )
}
