import { useState, useRef, useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { m } from 'framer-motion'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Tooltip } from '@/components/ui/tooltip'
import { useGameStore } from '@/stores/gameStore'
import { SkipForward, SkipBack, Loader2, Send } from 'lucide-react'
import { createGuessSubmissionService } from '@/services'
import { LetterRevealBar } from '@/components/game/LetterRevealBar'
import { useReducedMotionSafe } from '@/hooks/useReducedMotionSafe'
import { useGameGuess } from '@/hooks/useGameGuess'
import { useOnline } from '@/hooks/useOnline'
import { toast } from '@/lib/toast'
import { cn } from '@/lib/utils'

/**
 * Trigger device haptics when supported. Pure helper with no component state.
 */
function vibrate(pattern: number | number[]) {
  if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
    try {
      navigator.vibrate(pattern)
    } catch {
      // ignore unsupported
    }
  }
}

/**
 * Game guess input component with simple text input
 *
 * Users type the game name and submit - fuzzy matching is done on the backend.
 * The masked-title letter-reveal bar is fused to the input's top edge inside
 * one shared neon frame (one bordered unit — see the 2026-06-11 decision
 * record on legacy hint retirement).
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

      {/* Input with submit button. `items-end` keeps the nav buttons level
          with the input row when the letter bar makes the shell taller. */}
      <div className="flex items-end gap-1.5 sm:gap-2">
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

        <m.div
          className="relative flex-1 min-w-0"
          animate={isShaking ? { x: [-10, 10, -10, 10, 0] } : {}}
          transition={{ duration: 0.4 }}
        >
          {/* One bordered shell shared by the letter-reveal bar and the
              input — the neon frame lives here (focus-within mirrors the
              old input focus styles). */}
          <div
            className={cn(
              'rounded-xl overflow-hidden border-2 border-primary/30 shadow-[var(--glow-md)] bg-linear-to-r from-background/40 to-card/30 backdrop-blur-md md:backdrop-blur-xl focus-within:border-primary focus-within:shadow-[var(--glow-lg)] transition-all duration-300',
              isSuccess && 'border-success shadow-[var(--glow-success)] animate-pulse',
              !isSuccess && isShaking && 'border-error shadow-[var(--glow-error)]'
            )}
          >
            <LetterRevealBar />

            <div className="relative">
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
                className="h-12 sm:h-14 text-base md:text-lg border-0 rounded-none bg-transparent shadow-none focus-visible:ring-0 pl-3 sm:pl-4 pr-12 sm:pr-14 max-[360px]:pr-10"
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
            </div>
          </div>
        </m.div>

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
