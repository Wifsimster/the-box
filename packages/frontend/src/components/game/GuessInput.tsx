import { useState, useRef, useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { motion } from 'framer-motion'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Tooltip } from '@/components/ui/tooltip'
import { Alert } from '@/components/ui/alert'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useGameStore } from '@/stores/gameStore'
import { usePartyStore } from '@/stores/partyStore'
import { SkipForward, SkipBack, Loader2, Send, Flag } from 'lucide-react'
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
  const [showEndConfirm, setShowEndConfirm] = useState(false)
  const [isEnding, setIsEnding] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // Auth hook for admin check
  const { session } = useAuth()
  const isAdmin = session?.user?.role === 'admin'

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
    currentScreenshotData,
    endGameAction,
    challengeId,
  } = useGameStore()

  // Get party mode state (for multiplayer party features)
  const { isInParty, playerFinished } = usePartyStore()
  
  // Daily challenge game mode (party mode = daily guess game)
  const isDailyChallenge = challengeId !== null

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

      // Trigger shake animation on wrong guess
      if (result.success && !result.isCorrect) {
        setIsShaking(true)
        setTimeout(() => setIsShaking(false), 500)
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

  // Find previous navigable position (prioritize skipped/not_visited, but also allow correct)
  const findPreviousPosition = () => {
    // First pass: look for skipped or not_visited positions (preferred)
    for (let i = currentPosition - 1; i >= 1; i--) {
      const state = positionStates[i]
      if (state?.status === 'skipped' || state?.status === 'not_visited') {
        return i
      }
    }
    // Second pass: if no skipped/not_visited found, allow correct positions
    for (let i = currentPosition - 1; i >= 1; i--) {
      const state = positionStates[i]
      if (state?.status === 'correct') {
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

  // Show terminer button on last position (both party mode and daily game)
  const showTerminerButton = isLastPosition

  // Calculate unfound count for confirmation dialog
  const unfoundCount = useMemo(() => {
    if (!showTerminerButton) return 0
    return Object.values(positionStates).filter(
      (s) => s.status !== 'correct'
    ).length
  }, [showTerminerButton, positionStates])

  const UNFOUND_PENALTY = 50
  const penaltyPreview = unfoundCount * UNFOUND_PENALTY

  const handleEndGame = async () => {
    setIsEnding(true)
    try {
      // End the game session
      await endGameAction()
      
      // Get the final score after ending (it's updated by endGameAction)
      const finalScore = useGameStore.getState().totalScore
      
      // Notify the party that this player finished (only in party mode)
      if (isInParty) {
        playerFinished(finalScore)
      }
      
      setShowEndConfirm(false)
    } catch (err) {
      console.error('Failed to end game:', err)
      toast.error(t('game.errorEnding') || 'Failed to end game')
    } finally {
      setIsEnding(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleSubmit()
    }
  }

  return (
    <div className="relative">
      {/* Input with submit button */}
      <div className="flex gap-1.5 sm:gap-2">
        {/* Previous button - shown when there are skipped positions before current */}
        {canGoPrevious && (
          <Tooltip content={t('game.navigation.previous')}>
            <Button
              variant="gaming"
              size="lg"
              onClick={handlePrevious}
              disabled={gamePhase !== 'playing' || isSubmitting}
              className="h-12 sm:h-14 px-3 sm:px-4 md:px-6 min-w-[48px] sm:min-w-[56px] touch-manipulation"
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
            className={`h-12 sm:h-14 text-sm sm:text-base md:text-lg bg-card/80 backdrop-blur-sm border-2 focus:border-primary pl-3 sm:pl-4 pr-11 sm:pr-14 ${
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
            className="absolute right-1.5 sm:right-2 top-1/2 -translate-y-1/2 h-8 w-8 sm:h-10 sm:w-10 p-0 touch-manipulation"
          >
            {isSubmitting ? (
              <Loader2 className="h-4 w-4 sm:h-5 sm:w-5 animate-spin" />
            ) : (
              <Send className="h-4 w-4 sm:h-5 sm:w-5" />
            )}
          </Button>
        </motion.div>

        {/* Terminer button - shown on last screenshot (party mode and daily game) */}
        {showTerminerButton ? (
          <Button
            variant="default"
            size="lg"
            onClick={() => setShowEndConfirm(true)}
            disabled={gamePhase !== 'playing' || isSubmitting}
            className="h-12 sm:h-14 px-3 sm:px-4 md:px-6 touch-manipulation"
          >
            <Flag className="h-4 w-4 sm:h-5 sm:w-5 mr-1 sm:mr-2" />
            <span className="text-xs sm:text-sm md:text-base">{t('game.endGame.button')}</span>
          </Button>
        ) : (
          /* Skip/Next button - hidden on last screenshot */
          !isLastPosition && (
            <Tooltip content={t('game.navigation.skip')}>
              <Button
                variant="gaming"
                size="lg"
                onClick={handleSkip}
                disabled={gamePhase !== 'playing' || isSubmitting}
                className="h-12 sm:h-14 px-3 sm:px-4 md:px-6 min-w-[48px] sm:min-w-[56px] touch-manipulation"
              >
                <SkipForward className="h-4 w-4 sm:h-5 sm:w-5" />
              </Button>
            </Tooltip>
          )
        )}
      </div>

      {/* Admin hint - only shown to admin users */}
      {isAdmin && currentScreenshotData?.gameName && (
        <Alert variant="destructive" className="mt-1.5 sm:mt-2 py-1 sm:py-1.5">
          <span className="text-[10px] sm:text-xs font-medium">
            {t('game.adminHint')}: {currentScreenshotData.gameName}
          </span>
        </Alert>
      )}

      {/* End game confirmation dialog */}
      <Dialog open={showEndConfirm} onOpenChange={setShowEndConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('game.endGame.confirmTitle')}</DialogTitle>
            <DialogDescription>
              {t('game.endGame.confirmMessage', {
                unfound: unfoundCount,
                penalty: penaltyPreview,
              })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setShowEndConfirm(false)}
              disabled={isEnding}
              className="w-full sm:w-auto"
            >
              {t('common.cancel')}
            </Button>
            <Button
              variant="default"
              onClick={handleEndGame}
              disabled={isEnding}
              className="w-full sm:w-auto"
            >
              {isEnding && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              {t('game.endGame.confirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
