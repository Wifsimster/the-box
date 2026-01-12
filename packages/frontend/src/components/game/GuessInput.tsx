import { useState, useRef, useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { motion } from 'framer-motion'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Tooltip } from '@/components/ui/tooltip'
import { Alert } from '@/components/ui/alert'
import { useGameStore } from '@/stores/gameStore'
import { SkipForward, SkipBack, Loader2, Send } from 'lucide-react'
import { createGuessSubmissionService } from '@/services'
import { useGameGuess } from '@/hooks/useGameGuess'
import { toast } from '@/lib/toast'
import { useAuth } from '@/hooks/useAuth'

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
  const inputRef = useRef<HTMLInputElement>(null)

  // Auth hook for admin check
  const { session } = useAuth()
  const isAdmin = session?.user.role === 'admin'

  // Services (dependency injection via factory functions)
  const guessSubmissionService = useMemo(
    () => createGuessSubmissionService(),
    []
  )

  // Custom hook for guess submission logic
  const { submitGuess } = useGameGuess(guessSubmissionService)

  const {
    gamePhase,
    startScoreCountdown,
    skipToNextPosition,
    currentPosition,
    totalScreenshots,
    navigateToPosition,
    positionStates,
    currentScreenshotData,
  } = useGameStore()

  // Focus input when playing
  useEffect(() => {
    if (gamePhase === 'playing' && inputRef.current) {
      inputRef.current.focus()
      startScoreCountdown()
    }
  }, [gamePhase, startScoreCountdown])

  const handleSubmit = async () => {
    if (isSubmitting || !query.trim()) return

    setIsSubmitting(true)
    try {
      const result = await submitGuess(null, query.trim())

      // Show error toast if submission failed
      if (!result.success && result.error) {
        toast.error(result.error)
      }

      // Trigger shake animation on wrong guess
      if (result.success && !result.isCorrect) {
        setIsShaking(true)
        setTimeout(() => setIsShaking(false), 500)
      }

      setQuery('')
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

  // Find previous navigable position (skipped or in_progress positions before current)
  const findPreviousPosition = () => {
    for (let i = currentPosition - 1; i >= 1; i--) {
      const state = positionStates[i]
      if (state?.status === 'skipped') {
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
      {/* Input with submit button */}
      <div className="flex gap-2">
        {/* Previous button - shown when there are skipped positions before current */}
        {canGoPrevious && (
          <Tooltip content={t('game.navigation.previous')}>
            <Button
              variant="gaming"
              size="lg"
              onClick={handlePrevious}
              disabled={gamePhase !== 'playing' || isSubmitting}
              className="h-14 px-6"
            >
              <SkipBack className="w-5 h-5" />
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
            className={`h-14 text-lg bg-card/80 backdrop-blur-sm border-2 focus:border-primary pl-4 pr-14 ${
              isShaking ? 'border-red-500' : 'border-border'
            }`}
            disabled={gamePhase !== 'playing'}
          />

          {/* Submit button inside input */}
          <Button
            variant="ghost"
            size="sm"
            onClick={handleSubmit}
            disabled={!query.trim() || isSubmitting || gamePhase !== 'playing'}
            className="absolute right-2 top-1/2 -translate-y-1/2 h-10 w-10 p-0"
          >
            {isSubmitting ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <Send className="w-5 h-5" />
            )}
          </Button>
        </motion.div>

        {/* Skip/Next button - hidden on last screenshot */}
        {!isLastPosition && (
          <Tooltip content={t('game.navigation.skip')}>
            <Button
              variant="gaming"
              size="lg"
              onClick={handleSkip}
              disabled={gamePhase !== 'playing' || isSubmitting}
              className="h-14 px-6"
            >
              <SkipForward className="w-5 h-5" />
            </Button>
          </Tooltip>
        )}
      </div>

      {/* Admin hint - only shown to admin users */}
      {isAdmin && currentScreenshotData?.gameName && (
        <Alert variant="destructive" className="mt-2 py-1.5">
          <span className="text-xs font-medium">
            {t('game.adminHint')}: {currentScreenshotData.gameName}
          </span>
        </Alert>
      )}
    </div>
  )
}
