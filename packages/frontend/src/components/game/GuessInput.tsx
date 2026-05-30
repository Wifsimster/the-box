import { useState, useRef, useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { motion, AnimatePresence } from 'framer-motion'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Tooltip } from '@/components/ui/tooltip'
import { Badge } from '@/components/ui/badge'
import { useGameStore } from '@/stores/gameStore'
import { SkipForward, SkipBack, Loader2, Send, Calendar, Building2, Code2, Tag } from 'lucide-react'
import { createGuessSubmissionService } from '@/services'
import { useReducedMotionSafe } from '@/hooks/useReducedMotionSafe'
import { useGameGuess } from '@/hooks/useGameGuess'
import { useOnline } from '@/hooks/useOnline'
import { toast } from '@/lib/toast'
import { cn } from '@/lib/utils'

/**
 * Game guess input component with simple text input
 *
 * Users type the game name and submit - fuzzy matching is done on the backend
 */
export function GuessInput() {
  const { t } = useTranslation()
  const isOnline = useOnline()
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

  // Focus input when playing.
  // `preventScroll: true` stops Android Chrome from scrolling the screenshot out
  // of view when the input becomes active.
  useEffect(() => {
    if (gamePhase === 'playing' && inputRef.current) {
      inputRef.current.focus({ preventScroll: true })
    }
  }, [gamePhase])

  const prefersReducedMotion = useReducedMotionSafe()

  const vibrate = (pattern: number | number[]) => {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      try {
        navigator.vibrate(pattern)
      } catch {
        // ignore unsupported
      }
    }
  }

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
          setIsSuccess(true)
          setTimeout(() => setIsSuccess(false), 800)
          vibrate(15)
        } else {
          // Skip the shake for users who prefer reduced motion; the colour
          // change on the border still signals the error.
          if (!prefersReducedMotion) {
            setIsShaking(true)
            setTimeout(() => setIsShaking(false), 500)
          }
          vibrate([30, 40, 30])
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
  const hintGenreUsed = currentPosState?.hintGenreUsed || false

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleSubmit()
    }
  }

  const hasRevealedHints =
    (hintYearUsed && availableHints?.year) ||
    (hintPublisherUsed && availableHints?.publisher) ||
    (hintDeveloperUsed && availableHints?.developer) ||
    (hintGenreUsed && availableHints?.genre)

  return (
    <div className="relative">
      {/* Screen reader announcements */}
      <div aria-live="polite" aria-atomic="true" className="sr-only">
        {isSuccess && t('game.guessCorrect', { defaultValue: 'Correct guess!' })}
      </div>
      <div aria-live="assertive" aria-atomic="true" className="sr-only">
        {isShaking && t('game.guessIncorrect', { defaultValue: 'Incorrect guess. Try again.' })}
      </div>

      {/* Revealed hint chips - compact inline display above input */}
      <AnimatePresence>
        {hasRevealedHints && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="flex flex-wrap justify-center gap-1.5 pb-2">
              {hintYearUsed && availableHints?.year && (
                <Badge variant="info" className="gap-1 py-1 px-2.5 text-xs font-medium">
                  <Calendar className="size-3" aria-hidden="true" />
                  <span className="sr-only">{t('game.hints.yearHint')}: </span>
                  <span>{availableHints.year}</span>
                </Badge>
              )}
              {hintPublisherUsed && availableHints?.publisher && (
                <Badge variant="info" className="gap-1 py-1 px-2.5 text-xs font-medium max-w-[60vw] truncate">
                  <Building2 className="size-3 shrink-0" aria-hidden="true" />
                  <span className="sr-only">{t('game.hints.publisherHint')}: </span>
                  <span className="truncate">{availableHints.publisher}</span>
                </Badge>
              )}
              {hintDeveloperUsed && availableHints?.developer && (
                <Badge variant="info" className="gap-1 py-1 px-2.5 text-xs font-medium max-w-[60vw] truncate">
                  <Code2 className="size-3 shrink-0" aria-hidden="true" />
                  <span className="sr-only">{t('game.hints.developerHint')}: </span>
                  <span className="truncate">{availableHints.developer}</span>
                </Badge>
              )}
              {hintGenreUsed && availableHints?.genre && (
                <Badge variant="info" className="gap-1 py-1 px-2.5 text-xs font-medium max-w-[60vw] truncate">
                  <Tag className="size-3 shrink-0" aria-hidden="true" />
                  <span className="sr-only">{t('game.hints.genreHint')}: </span>
                  <span className="truncate">{availableHints.genre}</span>
                </Badge>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Input with submit button */}
      <div className="flex gap-1.5 sm:gap-2">
        {/* Previous button - shown when there are skipped positions before current */}
        {canGoPrevious && (
          <Tooltip content={t('game.navigation.previous')}>
            <Button
              variant="outline"
              size="icon"
              onClick={handlePrevious}
              disabled={gamePhase !== 'playing' || isSubmitting}
              aria-label={t('game.navigation.previous')}
              className="size-12 sm:size-14 max-[360px]:h-10 max-[360px]:w-10 shrink-0 touch-manipulation"
            >
              <SkipBack className="size-4 sm:size-5" />
            </Button>
          </Tooltip>
        )}

        <motion.div
          className="relative flex-1 min-w-0"
          animate={isShaking ? { x: [-10, 10, -10, 10, 0] } : {}}
          transition={{ duration: 0.4 }}
        >
          <Input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t('game.guessPlaceholder')}
            enterKeyHint="send"
            inputMode="text"
            autoComplete="off"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            className={cn(
              'h-12 sm:h-14 text-base md:text-lg bg-linear-to-r from-background/40 to-card/30 backdrop-blur-md md:backdrop-blur-xl border-2 border-primary/30 shadow-[var(--glow-md)] focus:border-primary focus:shadow-[var(--glow-lg)] pl-3 sm:pl-4 pr-12 sm:pr-14 max-[360px]:pr-10 transition-all duration-300',
              isSuccess && 'border-success shadow-[var(--glow-success)] animate-pulse',
              !isSuccess && isShaking && 'border-error shadow-[var(--glow-error)]'
            )}
            disabled={gamePhase !== 'playing'}
          />

          {/* Submit button inside input */}
          <Button
            variant="ghost"
            size="icon"
            onClick={handleSubmit}
            disabled={!query.trim() || isSubmitting || gamePhase !== 'playing' || !isOnline}
            aria-label={t('game.submit', { defaultValue: 'Submit guess' })}
            className={cn(
              'absolute right-1.5 sm:right-2 inset-y-0 my-auto size-9 sm:size-10 max-[360px]:size-8 p-0 touch-manipulation transition-all duration-300',
              query.trim()
                ? 'bg-linear-to-r from-neon-pink to-neon-purple hover:from-neon-pink/90 hover:to-neon-purple/90'
                : 'hover:bg-accent'
            )}
          >
            {isSubmitting ? (
              <Loader2 className={cn('size-4 sm:size-5 animate-spin', query.trim() && 'text-white')} />
            ) : (
              <Send className={cn('size-4 sm:size-5', query.trim() && 'text-white')} />
            )}
          </Button>
        </motion.div>

        {/* Skip/Next button - hidden on last screenshot */}
        {!isLastPosition && (
          <Tooltip content={t('game.navigation.skip')}>
            <Button
              variant="outline"
              size="icon"
              onClick={handleSkip}
              disabled={gamePhase !== 'playing' || isSubmitting}
              aria-label={t('game.navigation.skip')}
              className="size-12 sm:size-14 max-[360px]:h-10 max-[360px]:w-10 shrink-0 touch-manipulation"
            >
              <SkipForward className="size-4 sm:size-5" />
            </Button>
          </Tooltip>
        )}
      </div>
    </div>
  )
}
