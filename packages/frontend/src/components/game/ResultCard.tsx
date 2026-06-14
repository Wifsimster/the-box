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

// Format time display (e.g., "5s", "1:23", "10:05"). Pure helper — no component state.
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
  } = useGameStore()

  // Auto-close countdown state (must be before early return)
  const [countdown, setCountdown] = useState(AUTO_CLOSE_SECONDS)

  // Move focus to the primary "Next" action when the result dialog opens so
  // keyboard / screen-reader users land inside the dialog (and Enter-to-advance
  // has a sensible focus target) instead of being stranded on the now-disabled
  // guess input behind the overlay.
  const nextButtonRef = useRef<HTMLButtonElement>(null)

  // Memoize nextPosition calculation
  const nextPosition = lastResult ? findNextUnfinished(currentPosition) : null

  const handleNext = useCallback(() => {
    if (nextPosition) {
      // Navigate to next unfinished position
      navigateToPosition(nextPosition)
      // Initialize position state if not visited
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
      // No next position - check if we should auto-complete
      const isDailyGame = challengeId !== null
      const hasMissingGames = Object.values(positionStates).some(
        (state) => state.status !== 'correct'
      )

      // In daily games, only auto-complete if all games are discovered
      // Otherwise, stay on game screen to allow manual ending
      if (isDailyGame && hasMissingGames) {
        // Stay in playing phase to allow user to navigate and manually end
        setGamePhase('playing')
      } else {
        // All positions finished - show completion
        setGamePhase('challenge_complete')
      }
    }
  }, [nextPosition, navigateToPosition, positionStates, setGamePhase, challengeId])

  // Auto-navigation fires from the timer when it reaches zero. Wrapped as an
  // Effect Event so it always reads the latest state without being a reactive
  // dependency of the timer effect.
  const onAutoAdvance = useEffectEvent(() => {
    // Block auto-navigation while completion choice modal is visible
    if (showCompletionChoice) return
    // Only auto-navigate if there's a next position OR session is not completed
    const shouldAutoNavigate = nextPosition !== null || !isSessionCompleted
    if (shouldAutoNavigate) {
      handleNext()
    }
  })

  // Auto-close timer - only runs when there's a next position OR session is not completed yet
  // Timer is paused when completion choice modal is visible
  useEffect(() => {
    if (!lastResult) return

    // Pause countdown when completion choice modal is visible
    if (showCompletionChoice) return

    // Auto-close if:
    // 1. There's a next position to navigate to, OR
    // 2. Session is not completed (even if on last round, user can still navigate back)
    const shouldAutoClose = nextPosition !== null || !isSessionCompleted

    if (!shouldAutoClose) return

    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer)
          // Trigger navigation directly when the countdown elapses instead of
          // routing through a "countdown === 0" effect.
          onAutoAdvance()
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => clearInterval(timer)
  }, [lastResult, nextPosition, isSessionCompleted, showCompletionChoice])

  // Handle Enter key to advance. handleNext is read only inside the listener,
  // so it's wrapped as an Effect Event and kept out of the dependency array.
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

  // Focus the primary action once the dialog has a result to show.
  // `preventScroll` avoids yanking the screenshot on mobile.
  useEffect(() => {
    if (lastResult) nextButtonRef.current?.focus({ preventScroll: true })
  }, [lastResult])

  // Early return after all hooks
  if (!lastResult) return null

  const { isCorrect, correctGame, scoreEarned, timeTakenMs, userGuess, hintPenalty, letterPenalty, wrongGuessPenalty, matchPrecision } = lastResult
  const maxScore = 200
  const scorePercentage = (scoreEarned / maxScore) * 100
  const timeTakenSeconds = Math.round(timeTakenMs / 1000)

  // Check if there are any unfinished positions (for button text)
  const hasSkippedPositions = Object.values(positionStates).some(
    (state) => state.status === 'skipped'
  )

  const timeDisplay = formatTime(timeTakenSeconds)

  // Determine button text
  const getButtonText = () => {
    // Show "View Results" only when session is completed
    if (isSessionCompleted) {
      return t('game.viewResults')
    }
    // Otherwise, show navigation text
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
      className="absolute inset-0 z-40 flex items-center justify-center bg-background/90 backdrop-blur-lg"
    >
      {/* Success particles/glow effect */}
      {isCorrect && (
        <m.div
          initial={{ opacity: 0, scale: 0.5 }}
          animate={{ opacity: 1, scale: 1 }}
          className="absolute inset-0 pointer-events-none"
        >
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 size-96 bg-success/20 rounded-full blur-3xl" />
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
        className="relative max-w-sm w-full mx-4"
      >
        {/* Single concise outcome line for assistive tech — the visual card is
            built from animated fragments that don't read as one coherent
            announcement. Polite so it doesn't interrupt the miss/correct
            announcement already fired by the guess input. */}
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
          className="relative border-2 rounded-2xl p-6 shadow-2xl"
        >
        {/* Round Progress Badge */}
        <m.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="absolute -top-3 left-1/2 -translate-x-1/2 px-4 py-1 bg-muted rounded-full text-xs font-medium text-muted-foreground border border-border"
        >
          {t('game.round')} {currentPosition} / {totalScreenshots}
        </m.div>

        {/* Result Status Header */}
        <m.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.15, type: 'spring', stiffness: 400 }}
          className="text-center mb-4 pt-2"
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
                  {/* Distinct icon from the exact-match check so the partial
                      state isn't differentiated by colour alone (WCAG 1.4.1). */}
                  <Target className="size-5" />
                  {t('game.partialMatch')}
                </>
              ) : (
                <>
                  <CheckCircle className="size-5" />
                  {t('game.correct')}
                </>
              )
            ) : (
              <>
                <XCircle className="size-5" />
                {t('game.incorrect')}
              </>
            )}
          </div>
        </m.div>

        {/* Revealed game details */}
        <ResultGameInfo game={correctGame} isCorrect={isCorrect} userGuess={userGuess} />

        {/* Score Display */}
        <ResultScoreDisplay
          isCorrect={isCorrect}
          scoreEarned={scoreEarned}
          scorePercentage={scorePercentage}
          timeTakenMs={timeTakenMs}
          timeTakenSeconds={timeTakenSeconds}
          timeDisplay={timeDisplay}
          hintPenalty={hintPenalty}
          letterPenalty={letterPenalty}
          wrongGuessPenalty={wrongGuessPenalty}
          matchPrecision={matchPrecision}
        />

        {/* Next Button */}
        <m.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.7 }}
          className="flex flex-col items-center gap-2"
        >
          <Button
            ref={nextButtonRef}
            variant="secondary"
            size="lg"
            onClick={handleNext}
            className="w-full gap-2 font-bold"
          >
            {/* Show countdown only when auto-closing (session not completed or has next position) */}
            {(nextPosition !== null || !isSessionCompleted) ? `${getButtonText()} (${countdown}s)` : getButtonText()}
            <ChevronRight className="size-5" />
          </Button>
          <span className="text-xs text-muted-foreground">
            {t('game.pressEnterToContinue', 'Press Enter to continue')}
          </span>
        </m.div>
        </Card>
      </m.div>
    </m.div>
  )
}
