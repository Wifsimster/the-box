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
      className="flex items-center justify-center size-full"
    >
      <div className="text-center">
        <h1 className="text-4xl font-bold mb-4">{t('game.challengeComplete')}</h1>
        <p className="text-2xl text-primary font-bold mb-2">{totalScore} pts</p>

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
            className="flex items-center justify-center gap-3 text-muted-foreground mb-8"
          >
            <Globe className="size-5" />
            <span className="text-lg">
              {t('game.worldTotal')}:{' '}
              <span className="font-bold text-foreground">{worldScore.toLocaleString()}</span> pts
            </span>
          </m.div>
        )}

        <div className="flex gap-4 justify-center flex-wrap">
          <Button variant="gaming" size="lg" asChild>
            <Link to={localizedPath('/leaderboard')}>
              <Trophy className="size-4 mr-2" />
              {t('common.leaderboard')}
            </Link>
          </Button>
          <Button variant="outline" size="lg" asChild>
            <Link to={localizedPath('/')}>
              <Home className="size-4 mr-2" />
              {t('common.home')}
            </Link>
          </Button>
          {isAdmin && (
            <Button variant="outline" size="lg" onClick={onResetSession} disabled={isResetting}>
              <RotateCcw className={`size-4 mr-2 ${isResetting ? 'animate-spin' : ''}`} />
              {t('game.resetSession')}
            </Button>
          )}
        </div>
      </div>
    </m.div>
  )
}
