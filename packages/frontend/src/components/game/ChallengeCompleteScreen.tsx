import { useTranslation } from 'react-i18next'
import { m } from 'framer-motion'
import { Link } from 'react-router-dom'
import { Trophy, Home, Globe, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useLocalizedPath } from '@/hooks/useLocalizedPath'
import type { GuessResult } from '@/types'

/**
 * End-of-challenge summary screen (final score, hint-penalty note, world
 * total and navigation). Extracted from GamePage to keep that component
 * focused on the active game loop.
 */
export function ChallengeCompleteScreen({
  totalScore,
  guessResults,
  worldScore,
  isAdmin,
  isResetting,
  onResetSession,
}: {
  totalScore: number
  guessResults: GuessResult[]
  worldScore: number | null
  isAdmin: boolean
  isResetting: boolean
  onResetSession: () => void
}) {
  const { t } = useTranslation()
  const { localizedPath } = useLocalizedPath()
  const totalHintPenalties = guessResults.reduce(
    (sum, result) => sum + (result.hintPenalty || 0) + (result.letterPenalty || 0),
    0,
  )

  return (
    <m.div
      key="challenge-complete"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="flex size-full overflow-y-auto px-4 py-6"
    >
      <div className="m-auto w-full max-w-md text-center">
        <h1 className="gradient-gaming-title text-3xl sm:text-4xl font-bold mb-4">{t('game.challengeComplete')}</h1>
        <p className="text-3xl sm:text-4xl text-primary font-bold tabular-nums mb-2">{totalScore} pts</p>

        {/* Hint Penalties Summary */}
        {totalHintPenalties > 0 && (
          <m.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="text-sm text-score-low mb-6"
          >
            {t('game.hints.penaltyApplied', { penalty: totalHintPenalties })}
          </m.div>
        )}

        {/* World Total Score */}
        {worldScore !== null && (
          <m.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="flex items-center justify-center gap-2 text-muted-foreground mb-6 sm:mb-8"
          >
            <Globe className="size-5 shrink-0" aria-hidden="true" />
            <span className="text-sm sm:text-lg">
              {t('game.worldTotal')}:{' '}
              <span className="font-bold text-foreground">{worldScore.toLocaleString()}</span> pts
            </span>
          </m.div>
        )}

        <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 justify-center">
          <Button variant="gaming" size="lg" asChild className="w-full sm:w-auto">
            <Link to={localizedPath('/leaderboard')}>
              <Trophy className="size-4" aria-hidden="true" />
              {t('common.leaderboard')}
            </Link>
          </Button>
          <Button variant="outline" size="lg" asChild className="w-full sm:w-auto">
            <Link to={localizedPath('/')}>
              <Home className="size-4" aria-hidden="true" />
              {t('common.home')}
            </Link>
          </Button>
          {isAdmin && (
            <Button variant="ghost" size="lg" onClick={onResetSession} disabled={isResetting} className="w-full sm:w-auto">
              <RotateCcw className={`size-4 ${isResetting ? 'animate-spin' : ''}`} aria-hidden="true" />
              {t('game.resetSession')}
            </Button>
          )}
        </div>
      </div>
    </m.div>
  )
}
