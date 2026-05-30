import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { m } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Trophy, Target, ArrowLeft, CheckCircle, XCircle, Clock, Loader2 } from 'lucide-react'
import { useLocalizedPath } from '@/hooks/useLocalizedPath'
import { gameApi } from '@/lib/api/game'
import { getApiErrorMessage } from '@/lib/api-errors'
import type { GameSessionDetailsResponse, GuessAttempt } from '@/types'
import { calculateSpeedMultiplier, formatDiscoveryTime } from '@/lib/utils'
import { GuessAttemptsList } from '@/components/game/GuessAttemptsList'
import { useReducedMotionSafe } from '@/hooks/useReducedMotionSafe'

export default function GameHistoryDetailsPage() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const { localizedPath } = useLocalizedPath()
  const { sessionId } = useParams<{ sessionId: string }>()
  const [sessionData, setSessionData] = useState<GameSessionDetailsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const reducedMotion = useReducedMotionSafe()

  /* eslint-disable react-hooks/set-state-in-effect -- Necessary pattern for data fetching */
  useEffect(() => {
    if (!sessionId) {
      setError(t('apiErrors.INVALID_SESSION_ID'))
      setLoading(false)
      return
    }

    gameApi.getGameSessionDetails(sessionId)
      .then(data => {
        setSessionData(data)
        setError(null)
      })
      .catch(err => {
        setError(getApiErrorMessage(err))
      })
      .finally(() => {
        setLoading(false)
      })
  }, [sessionId, t])
  /* eslint-enable react-hooks/set-state-in-effect */

  if (loading) {
    return (
      <div className="container mx-auto px-3 py-4 sm:px-4 sm:py-6 md:px-6 md:py-8 max-w-4xl">
        <div className="flex justify-center items-center min-h-[400px]">
          <Loader2 className="size-8 animate-spin text-primary" />
        </div>
      </div>
    )
  }

  if (error || !sessionData) {
    return (
      <div className="container mx-auto px-3 py-4 sm:px-4 sm:py-6 md:px-6 md:py-8 max-w-4xl">
        <div className="text-center py-12">
          <p className="text-muted-foreground mb-4">{error || 'Session not found'}</p>
          <Button onClick={() => navigate(localizedPath('/history'))}>
            <ArrowLeft className="size-4 mr-2" />
            {t('common.back')}
          </Button>
        </div>
      </div>
    )
  }

  // Calculate statistics and merge unfound games with guesses
  const allResults: Array<{
    position: number
    isCorrect: boolean
    correctGame: typeof sessionData.guesses[0]['correctGame']
    userGuess: string | null
    timeTakenMs: number
    scoreEarned: number
    hintPenalty?: number
    wrongGuessPenalty?: number
    tryNumber: number
    screenshot?: { thumbnailUrl?: string; imageUrl: string }
    attempts: GuessAttempt[]
  }> = sessionData.guesses.map(g => ({
    ...g,
    attempts: g.attempts ?? [],
  }))

  // Add unfound games as unguessed entries
  if (sessionData.unfoundGames && sessionData.unfoundGames.length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Backend response shape varies
    const unfoundResults = sessionData.unfoundGames.map((unfound: any) => ({
      position: unfound.position,
      isCorrect: false,
      correctGame: unfound.game,
      userGuess: null,
      timeTakenMs: 0,
      scoreEarned: -50,
      tryNumber: 0,
      screenshot: unfound.screenshot,
      attempts: [] as GuessAttempt[],
    }))
    allResults.push(...unfoundResults)
  }

  // Sort by position
  allResults.sort((a, b) => a.position - b.position)

  const correctAnswers = allResults.filter(g => g.isCorrect).length
  const accuracy = sessionData.totalScreenshots > 0
    ? Math.round((correctAnswers / sessionData.totalScreenshots) * 100)
    : 0

  // Format date for display
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    return date.toLocaleDateString(i18n.language, {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
  }

  return (
    <div className="container mx-auto p-3 sm:px-4 sm:py-6 md:px-6 md:py-8 max-w-4xl">
      {/* Back link — top-left, compact on mobile to free vertical space */}
      <div className="mb-3 sm:mb-4 md:mb-6">
        <Button
          variant="ghost"
          size="sm"
          className="-ml-2 h-9 px-2 text-muted-foreground hover:text-foreground"
          onClick={() => navigate(localizedPath('/history'))}
        >
          <ArrowLeft className="size-4 mr-1.5" aria-hidden="true" />
          <span>{t('common.back')}</span>
        </Button>
      </div>

      <m.div
        initial={reducedMotion ? false : { opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: reducedMotion ? 0 : 0.5 }}
        className="text-center mb-5 sm:mb-6 md:mb-8"
      >
        {sessionData.totalScore > 0 ? (
          <>
            <m.div
              initial={reducedMotion ? false : { scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ duration: reducedMotion ? 0 : 0.5, delay: reducedMotion ? 0 : 0.2, type: reducedMotion ? 'tween' : 'spring' }}
              style={{ boxShadow: sessionData.isPersonalBest ? 'var(--glow-lg)' : 'var(--glow-md)' }}
              className={`inline-flex items-center justify-center size-14 sm:size-20 mb-2 sm:mb-4 rounded-full bg-linear-to-br ${sessionData.isPersonalBest
                ? 'from-medal-gold to-medal-gold/70'
                : 'from-neon-purple to-neon-pink'
                }`}
              aria-hidden="true"
            >
              <Trophy className="size-7 sm:size-10 text-white" />
            </m.div>
            {sessionData.isPersonalBest && (
              <div className="mb-2">
                <Badge variant="warning" className="text-medal-gold border-medal-gold/40 bg-medal-gold/10">
                  <Trophy className="size-3 mr-1" aria-hidden="true" />
                  {t('history.personalBest')}
                </Badge>
              </div>
            )}
          </>
        ) : (
          <div
            className="inline-flex items-center justify-center size-14 sm:size-20 mb-2 sm:mb-4 rounded-full bg-secondary border border-border"
            aria-hidden="true"
          >
            <Target className="size-7 sm:size-10 text-muted-foreground" />
          </div>
        )}

        {sessionData.totalScore > 0 ? (
          <h1 className="text-xl sm:text-3xl md:text-4xl font-bold mb-1.5 sm:mb-3 gradient-gaming bg-clip-text text-transparent">
            {formatDate(sessionData.challengeDate)}
          </h1>
        ) : (
          <>
            <h1 className="text-xl sm:text-3xl md:text-4xl font-bold mb-2 text-foreground">
              {t('history.zeroScore.title')}
            </h1>
            <p className="text-sm sm:text-base text-muted-foreground mb-2 sm:mb-4 max-w-md mx-auto">
              {t('history.zeroScore.subtitle')}
            </p>
            <p className="text-xs sm:text-sm text-muted-foreground mb-2 sm:mb-4">
              {formatDate(sessionData.challengeDate)}
            </p>
          </>
        )}

        <m.div
          initial={reducedMotion ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: reducedMotion ? 0 : 0.5, delay: reducedMotion ? 0 : 0.4 }}
          className={`text-4xl sm:text-4xl md:text-5xl lg:text-6xl font-bold mb-2 sm:mb-4 ${sessionData.totalScore === 0
            ? 'text-muted-foreground'
            : sessionData.isPersonalBest
              ? 'text-medal-gold'
              : 'text-primary'
            }`}
          aria-label={`${sessionData.totalScore} ${t('game.totalScore')}${sessionData.isPersonalBest ? ` — ${t('history.personalBest')}` : ''}`}
        >
          {sessionData.totalScore} pts
        </m.div>

        <div className="flex justify-center gap-4 sm:gap-6 md:gap-8 text-muted-foreground">
          <div className="flex flex-col items-center">
            <div className="flex items-baseline gap-1">
              <span className="text-foreground font-bold text-lg sm:text-xl md:text-2xl">{correctAnswers}</span>
              <span className="text-xs sm:text-sm">/{sessionData.totalScreenshots}</span>
            </div>
            <p className="text-xs sm:text-sm mt-1">{t('game.correctAnswers')}</p>
          </div>
          <Separator orientation="vertical" className="h-8 sm:h-10 md:h-12" />
          <div className="flex flex-col items-center">
            <span className="text-foreground font-bold text-lg sm:text-xl md:text-2xl">{accuracy}%</span>
            <p className="text-xs sm:text-sm mt-1">{t('game.accuracy')}</p>
          </div>
        </div>
      </m.div>

      {/* Results Summary — single render, page scrolls naturally on mobile + desktop */}
      <Card className="bg-card/50 border-border">
        <CardContent className="pt-4 sm:pt-6">
          <h2 className="font-semibold text-base sm:text-lg mb-3 sm:mb-4">{t('game.resultsSummary')}</h2>
          <ul className="space-y-2 sm:space-y-3 list-none">
            {allResults.map((result: typeof allResults[0], index: number) => {
              const isUnguessed = !result.isCorrect && result.userGuess === null && result.scoreEarned === -50
              const multiplier = result.isCorrect && result.scoreEarned > 0 ? calculateSpeedMultiplier(result.timeTakenMs) : 1
              return (
                <m.li
                  key={result.position}
                  initial={reducedMotion ? false : { opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: reducedMotion ? 0 : 0.3, delay: reducedMotion ? 0 : index * 0.05 }}
                  className={`flex items-start gap-2 sm:gap-3 p-2.5 sm:p-3 rounded-lg ${isUnguessed ? 'bg-destructive/10 border border-destructive/20' : 'bg-secondary/50'
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
                    {isUnguessed && result.attempts.length === 0 && (
                      <span className="text-xs sm:text-sm text-destructive block mt-0.5">
                        {t('game.notFound')}
                      </span>
                    )}
                    {result.attempts.length > 0 && (
                      <>
                        <span className="text-xs text-muted-foreground block mt-0.5">
                          {t('game.attempts.count', { count: result.attempts.length })}
                        </span>
                        <GuessAttemptsList attempts={result.attempts} />
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

            {allResults.length === 0 && sessionData.totalScreenshots === 0 && (
              <p className="text-center text-muted-foreground py-6 sm:py-8 text-sm sm:text-base">
                {t('game.noResults')}
              </p>
            )}
          </ul>
        </CardContent>
      </Card>
    </div>
  )
}
