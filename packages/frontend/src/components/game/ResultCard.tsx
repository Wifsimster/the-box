import { useState, useEffect, useCallback, useRef } from 'react'
import { useEffectEvent } from 'react'
import { m } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { useGameStore } from '@/stores/gameStore'
import { CheckCircle, XCircle, ChevronRight, Target } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ResultGameInfo } from './ResultGameInfo'
import { ResultScoreDisplay } from './ResultScoreDisplay'

const AUTO_CLOSE_SECONDS = 5

function formatTime(seconds: number): string {
  if (seconds < 60) {
    return `${seconds}s`
  }
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

export function ResultCard() {
  const { t } = useTranslation()
  const {
    lastResult,
    currentPosition,
    totalScreenshots,
    setGamePhase,
    findNextUnfinished,
    navigateToPosition,
    positionStates,
    challengeId,
    isSessionCompleted,
    showCompletionChoice,
    pendingCompletionChoice,
    setPendingCompletionChoice,
    setShowCompletionChoice,
  } = useGameStore()

  const [countdown, setCountdown] = useState(AUTO_CLOSE_SECONDS)

  const nextButtonRef = useRef<HTMLButtonElement>(null)

  const nextPosition = lastResult ? findNextUnfinished(currentPosition) : null

  const handleNext = useCallback(() => {
    if (pendingCompletionChoice) {
      setPendingCompletionChoice(false)
      setGamePhase('playing')
      setShowCompletionChoice(true)
      return
    }
    if (nextPosition) {
      navigateToPosition(nextPosition)
      const nextState = positionStates[nextPosition]
      if (!nextState || nextState.status === 'not_visited') {
        useGameStore.setState((state) => ({
          positionStates: {
            ...state.positionStates,
            [nextPosition]: {
              position: nextPosition,
              status: 'in_progress',
              isCorrect: false,
            },
          },
        }))
      }
      setGamePhase('playing')
    } else {
      const isDailyGame = challengeId !== null
      const hasMissingGames = Object.values(positionStates).some(
        (state) => state.status !== 'correct'
      )

      if (isDailyGame && hasMissingGames) {
        setGamePhase('playing')
      } else {
        setGamePhase('challenge_complete')
      }
    }
  }, [
    nextPosition,
    navigateToPosition,
    positionStates,
    setGamePhase,
    challengeId,
    pendingCompletionChoice,
    setPendingCompletionChoice,
    setShowCompletionChoice,
  ])

  const onAutoAdvance = useEffectEvent(() => {
    if (showCompletionChoice) return
    const shouldAutoNavigate = nextPosition !== null || !isSessionCompleted
    if (shouldAutoNavigate) {
      handleNext()
    }
  })

  useEffect(() => {
    if (!lastResult) return

    if (showCompletionChoice) return

    const shouldAutoClose = nextPosition !== null || !isSessionCompleted

    if (!shouldAutoClose) return

    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer)
          onAutoAdvance()
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => clearInterval(timer)
  }, [lastResult, nextPosition, isSessionCompleted, showCompletionChoice])

  const onEnterKey = useEffectEvent(() => {
    handleNext()
  })

  useEffect(() => {
    if (!lastResult) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        onEnterKey()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [lastResult])

  useEffect(() => {
    if (lastResult) nextButtonRef.current?.focus({ preventScroll: true })
  }, [lastResult])

  if (!lastResult) return null

  const { isCorrect, correctGame, scoreEarned, timeTakenMs, userGuess, hintPenalty, letterPenalty, wrongGuessPenalty, streakBonus, streak, matchPrecision } = lastResult
  const maxScore = 200
  const scorePercentage = (scoreEarned / maxScore) * 100
  const timeTakenSeconds = Math.round(timeTakenMs / 1000)

  const hasSkippedPositions = Object.values(positionStates).some(
    (state) => state.status === 'skipped'
  )

  const timeDisplay = formatTime(timeTakenSeconds)

  const getButtonText = () => {
    if (pendingCompletionChoice) {
      return t('game.continue', 'Continue')
    }
    if (isSessionCompleted) {
      return t('game.viewResults')
    }
    if (hasSkippedPositions && nextPosition && nextPosition < currentPosition) {
      return t('game.navigation.reviewSkipped', 'Review Skipped')
    }
    return t('game.nextRound')
  }

  return (
    <m.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="absolute inset-0 z-40 flex overflow-y-auto overscroll-contain bg-background/90 backdrop-blur-lg px-4 py-6"
    >
      {isCorrect && (
        <m.div
          initial={{ opacity: 0, scale: 0.5 }}
          animate={{ opacity: 1, scale: 1 }}
          className="absolute inset-0 pointer-events-none"
        >
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 size-72 sm:size-96 bg-success/20 rounded-full blur-3xl" />
        </m.div>
      )}

      <m.div
        role="dialog"
        aria-modal="true"
        aria-label={t('game.resultDialogLabel', 'Round result')}
        initial={{ scale: 0.9, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.9, opacity: 0 }}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        className="relative m-auto max-w-sm w-full"
      >
        <div role="status" aria-live="polite" className="sr-only">
          {t('game.resultAnnounce', {
            outcome: isCorrect
              ? matchPrecision === 'partial'
                ? t('game.partialMatch')
                : t('game.correct')
              : t('game.incorrect'),
            answer: correctGame?.name ?? '',
            score: scoreEarned,
            defaultValue: `${
              isCorrect ? t('game.correct') : t('game.incorrect')
            } ${correctGame?.name ?? ''} +${scoreEarned}`,
          })}
        </div>
        <Card
          variant={isCorrect ? 'success' : 'error'}
          className="relative border-2 p-(--card-padding) pt-6 shadow-2xl"
        >
        <m.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="absolute -top-3 left-1/2 -translate-x-1/2 whitespace-nowrap px-4 py-1 bg-muted rounded-full text-xs font-medium text-muted-foreground border border-border tabular-nums"
        >
          {t('game.round')} {currentPosition} / {totalScreenshots}
        </m.div>

        <m.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.15, type: 'spring', stiffness: 400 }}
          className="text-center mb-3 sm:mb-4"
        >
          <div
            className={cn(
              "inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-bold",
              !isCorrect
                ? "bg-error/20 text-error"
                : matchPrecision === 'partial'
                  ? "bg-score-mid/20 text-score-mid"
                  : "bg-success/20 text-success"
            )}
          >
            {isCorrect ? (
              matchPrecision === 'partial' ? (
                <>
                  <Target className="size-5" aria-hidden="true" />
                  {t('game.partialMatch')}
                </>
              ) : (
                <>
                  <CheckCircle className="size-5" aria-hidden="true" />
                  {t('game.correct')}
                </>
              )
            ) : (
              <>
                <XCircle className="size-5" aria-hidden="true" />
                {t('game.incorrect')}
              </>
            )}
          </div>
        </m.div>

        <ResultGameInfo game={correctGame} isCorrect={isCorrect} userGuess={userGuess} />

        <ResultScoreDisplay
          isCorrect={isCorrect}
          scoreEarned={scoreEarned}
          scorePercentage={scorePercentage}
          timeTakenMs={timeTakenMs}
          timeTakenSeconds={timeTakenSeconds}
          timeDisplay={timeDisplay}
          hintPenalty={hintPenalty}
          letterPenalty={letterPenalty}
          streakBonus={streakBonus}
          streak={streak}
          wrongGuessPenalty={wrongGuessPenalty}
          matchPrecision={matchPrecision}
        />

        <m.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.7 }}
          className="flex flex-col items-center gap-2"
        >
          <Button
            ref={nextButtonRef}
            variant="gaming"
            size="lg"
            onClick={handleNext}
            className="w-full gap-2 font-bold"
          >
            {(nextPosition !== null || !isSessionCompleted) ? (
              <>
                {getButtonText()}
                <span className="tabular-nums" aria-hidden="true">({countdown}s)</span>
              </>
            ) : getButtonText()}
            <ChevronRight className="size-5" aria-hidden="true" />
          </Button>
          <span className="hidden pointer-fine:inline text-xs text-muted-foreground">
            {t('game.pressEnterToContinue', 'Press Enter to continue')}
          </span>
        </m.div>
        </Card>
      </m.div>
    </m.div>
  )
}
