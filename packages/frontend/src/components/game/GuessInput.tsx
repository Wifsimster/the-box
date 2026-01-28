import { useState, useRef, useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { motion } from 'framer-motion'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Tooltip } from '@/components/ui/tooltip'
import { Alert } from '@/components/ui/alert'
import { useGameStore } from '@/stores/gameStore'
import { SkipForward, SkipBack, Loader2, Send, Calendar, Building2, Code2 } from 'lucide-react'
import { createGuessSubmissionService } from '@/services'
import { useGameGuess } from '@/hooks/useGameGuess'
import { toast } from '@/lib/toast'

/**
 * Game guess input component with simple text input
 *
 * Users type the game name and submit - fuzzy matching is done on the backend
 */
export function GuessInput() {
  const { t } = useTranslation()
  const [query, setQuery] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isShaking, setIsShaking] = useState(false)
  const [isSuccess, setIsSuccess] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // Services (dependency injection via factory functions)
  const guessSubmissionService = useMemo(
    () => createGuessSubmissionService(),
    []
  )

  // Custom hook for guess submission logic
  const { submitGuess } = useGameGuess(guessSubmissionService)

  const {
    gamePhase,
    skipToNextPosition,
    currentPosition,
    totalScreenshots,
    navigateToPosition,
    positionStates,
    availableHints,
  } = useGameStore()

  // Focus input when playing
  useEffect(() => {
    if (gamePhase === 'playing' && inputRef.current) {
      inputRef.current.focus()
    }
  }, [gamePhase])

  const handleSubmit = async () => {
    if (isSubmitting || !query.trim()) return

    setIsSubmitting(true)
    try {
      const result = await submitGuess(null, query.trim())

      // Show error toast if submission failed
      if (!result.success && result.error) {
        toast.error(result.error)
      }

      // Trigger animations based on result
      if (result.success) {
        if (result.isCorrect) {
          // Green glow animation for correct guess
          setIsSuccess(true)
          setTimeout(() => setIsSuccess(false), 800)
        } else {
          // Red shake animation for incorrect guess
          setIsShaking(true)
          setTimeout(() => setIsShaking(false), 500)
        }
      }

      // Clear input logic:
      // - Always clear on correct guess (user advances to next screenshot)
      // - In daily challenge mode: Keep value on wrong guess (user can fix and retry)
      // - In other modes: Always clear (preserve current behavior)
      if (result.success) {
        // Get current challenge ID to check if we're in daily challenge mode
        const currentChallengeId = useGameStore.getState().challengeId
        const isDailyChallengeMode = currentChallengeId !== null

        if (result.isCorrect) {
          // Correct guess - always clear
          setQuery('')
        } else if (!isDailyChallengeMode) {
          // Wrong guess in non-daily challenge mode - clear (preserve current behavior)
          setQuery('')
        }
        // Wrong guess in daily challenge mode - keep value (don't clear)
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleSkip = () => {
    if (isSubmitting) return

    // Skip to next position without using a try (preserves tries for later)
    skipToNextPosition()
    setQuery('')
  }

  // Find previous navigable position (include all positions: skipped, not_visited, correct)
  const findPreviousPosition = () => {
    for (let i = currentPosition - 1; i >= 1; i--) {
      const state = positionStates[i]
      if (state?.status === 'skipped' || state?.status === 'not_visited' || state?.status === 'correct') {
        return i
      }
    }
    return null
  }

  const handlePrevious = () => {
    if (isSubmitting) return

    const prevPos = findPreviousPosition()
    if (prevPos) {
      navigateToPosition(prevPos)
      setQuery('')
    }
  }

  // Can show previous button if position > 1 and there's a skipped position before
  const previousPosition = findPreviousPosition()
  const canGoPrevious = currentPosition > 1 && previousPosition !== null

  // Hide skip button on last screenshot
  const isLastPosition = currentPosition === totalScreenshots

  // Get current position state for hint display
  const currentPosState = positionStates[currentPosition]
  const hintYearUsed = currentPosState?.hintYearUsed || false
  const hintPublisherUsed = currentPosState?.hintPublisherUsed || false
  const hintDeveloperUsed = currentPosState?.hintDeveloperUsed || false

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleSubmit()
    }
  }

  return (
    <div className="relative">
      {/* Screen reader announcements */}
      <div aria-live="polite" aria-atomic="true" className="sr-only">
        {isSuccess && t('game.guessCorrect', { defaultValue: 'Correct guess!' })}
      </div>
      <div aria-live="assertive" aria-atomic="true" className="sr-only">
        {isShaking && t('game.guessIncorrect', { defaultValue: 'Incorrect guess. Try again.' })}
      </div>

      {/* Input with submit button */}
      <div className="flex gap-1.5 sm:gap-2">
        {/* Previous button - shown when there are skipped positions before current */}
        {canGoPrevious && (
          <Tooltip content={t('game.navigation.previous')}>
            <Button
              variant="outline"
              size="lg"
              onClick={handlePrevious}
              disabled={gamePhase !== 'playing' || isSubmitting}
              className="h-12 sm:h-14 px-3 sm:px-4 md:px-6 min-w-12 sm:min-w-14 touch-manipulation"
            >
              <SkipBack className="h-4 w-4 sm:h-5 sm:w-5" />
            </Button>
          </Tooltip>
        )}

        <motion.div
          className="relative flex-1"
          animate={isShaking ? { x: [-10, 10, -10, 10, 0] } : {}}
          transition={{ duration: 0.4 }}
        >
          <Input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t('game.guessPlaceholder')}
            className={`h-12 sm:h-14 text-sm sm:text-base md:text-lg bg-gradient-to-r from-background/40 to-card/30 backdrop-blur-md md:backdrop-blur-xl border-2 border-primary/30 shadow-[0_0_20px_rgba(168,85,247,0.3)] focus:border-primary focus:shadow-[0_0_30px_rgba(168,85,247,0.5)] pl-3 sm:pl-4 pr-11 sm:pr-14 transition-all duration-300 ${isSuccess
              ? 'border-green-500 shadow-[0_0_30px_rgba(34,197,94,0.6)] animate-pulse'
              : isShaking
                ? 'border-red-500 shadow-[0_0_20px_rgba(239,68,68,0.5)]'
                : ''
              }`}
            disabled={gamePhase !== 'playing'}
          />

          {/* Submit button inside input */}
          <Button
            variant="ghost"
            size="sm"
            onClick={handleSubmit}
            disabled={!query.trim() || isSubmitting || gamePhase !== 'playing'}
            className={`absolute right-1.5 sm:right-2 top-1/2 -translate-y-1/2 h-8 w-8 sm:h-10 sm:w-10 p-0 touch-manipulation transition-all duration-300 ${query.trim()
              ? 'bg-gradient-to-r from-neon-pink to-neon-purple hover:from-neon-pink/90 hover:to-neon-purple/90'
              : 'hover:bg-accent'
              }`}
          >
            {isSubmitting ? (
              <Loader2 className={`h-4 w-4 sm:h-5 sm:w-5 animate-spin ${query.trim() ? 'text-white' : ''}`} />
            ) : (
              <Send className={`h-4 w-4 sm:h-5 sm:w-5 ${query.trim() ? 'text-white' : ''}`} />
            )}
          </Button>
        </motion.div>

        {/* Skip/Next button - hidden on last screenshot */}
        {!isLastPosition && (
          <Tooltip content={t('game.navigation.skip')}>
            <Button
              variant="outline"
              size="lg"
              onClick={handleSkip}
              disabled={gamePhase !== 'playing' || isSubmitting}
              className="h-12 sm:h-14 px-3 sm:px-4 md:px-6 min-w-12 sm:min-w-14 touch-manipulation"
            >
              <SkipForward className="h-4 w-4 sm:h-5 sm:w-5" />
            </Button>
          </Tooltip>
        )}
      </div>

      {/* Hint displays - shown when hints are used */}
      {hintYearUsed && availableHints?.year && (
        <Alert className="mt-1.5 sm:mt-2 py-1.5 sm:py-2">
          <Calendar className="h-3 w-3 sm:h-4 sm:w-4" />
          <span className="text-xs sm:text-sm">
            {t('game.hints.yearHint')}: <strong>{availableHints.year}</strong>
          </span>
        </Alert>
      )}

      {hintPublisherUsed && availableHints?.publisher && (
        <Alert className="mt-1.5 sm:mt-2 py-1.5 sm:py-2">
          <Building2 className="h-3 w-3 sm:h-4 sm:w-4" />
          <span className="text-xs sm:text-sm">
            {t('game.hints.publisherHint')}: <strong>{availableHints.publisher}</strong>
          </span>
        </Alert>
      )}

      {hintDeveloperUsed && availableHints?.developer && (
        <Alert className="mt-1.5 sm:mt-2 py-1.5 sm:py-2">
          <Code2 className="h-3 w-3 sm:h-4 sm:w-4" />
          <span className="text-xs sm:text-sm">
            {t('game.hints.developerHint')}: <strong>{availableHints.developer}</strong>
          </span>
        </Alert>
      )}

    </div>
  )
}
