import { useEffect, useReducer } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { m } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Trophy, Target, ArrowLeft, Loader2 } from 'lucide-react'
import { useLocalizedPath } from '@/hooks/useLocalizedPath'
import { gameApi } from '@/lib/api/game'
import { getApiErrorMessage } from '@/lib/api-errors'
import type { GameSessionDetailsResponse, GuessAttempt } from '@/types'
import { useReducedMotionSafe } from '@/hooks/useReducedMotionSafe'
import { GameHistoryResultsList, type HistoryResultItem } from '@/components/history/GameHistoryResultsList'

interface DetailsState {
  sessionData: GameSessionDetailsResponse | null
  loading: boolean
  error: string | null
}

type DetailsAction =
  | { type: 'loaded'; sessionData: GameSessionDetailsResponse }
  | { type: 'failed'; error: string }

const initialDetails: DetailsState = {
  sessionData: null,
  loading: true,
  error: null,
}

function detailsReducer(state: DetailsState, action: DetailsAction): DetailsState {
  switch (action.type) {
    case 'loaded':
      return { sessionData: action.sessionData, loading: false, error: null }
    case 'failed':
      return { sessionData: null, loading: false, error: action.error }
    default:
      return state
  }
}

export default function GameHistoryDetailsPage() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const { localizedPath } = useLocalizedPath()
  const { sessionId } = useParams<{ sessionId: string }>()
  const [{ sessionData, loading, error }, dispatch] = useReducer(
    detailsReducer,
    initialDetails,
  )
  const reducedMotion = useReducedMotionSafe()

  useEffect(() => {
    if (!sessionId) {
      dispatch({ type: 'failed', error: t('apiErrors.INVALID_SESSION_ID') })
      return
    }

    gameApi.getGameSessionDetails(sessionId)
      .then(data => {
        dispatch({ type: 'loaded', sessionData: data })
      })
      .catch(err => {
        dispatch({ type: 'failed', error: getApiErrorMessage(err) })
      })
  }, [sessionId, t])

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
  const allResults: HistoryResultItem[] = sessionData.guesses.map(g => ({
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
          <GameHistoryResultsList
            results={allResults}
            totalScreenshots={sessionData.totalScreenshots}
            reducedMotion={reducedMotion}
          />
        </CardContent>
      </Card>
    </div>
  )
}
