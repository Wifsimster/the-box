import { useTranslation } from 'react-i18next'
import { motion } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Tooltip } from '@/components/ui/tooltip'
import { useGameStore } from '@/stores/gameStore'
import { ChevronLeft, ChevronRight, SkipForward } from 'lucide-react'
import { useMemo } from 'react'

/**
 * NavigationControls provides prev/next/skip buttons for screenshot navigation.
 * - Previous: Go back to last skipped screenshot
 * - Next/Skip: Skip current screenshot (preserve tries) and move forward
 */
export function NavigationControls() {
  const { t } = useTranslation()
  const {
    currentPosition,
    positionStates,
    totalScreenshots,
    skipToNextPosition,
    navigateToPosition,
    gamePhase,
  } = useGameStore()

  // Find previous navigable position (include all positions: skipped, not_visited, correct)
  const previousPosition = useMemo(() => {
    for (let i = currentPosition - 1; i >= 1; i--) {
      const state = positionStates[i]
      if (state?.status === 'skipped' || state?.status === 'not_visited' || state?.status === 'correct') {
        return i
      }
    }
    return null
  }, [currentPosition, positionStates])

  // Check if there's a next position (include correct positions)
  const hasNext = useMemo(() => {
    // Check forward positions
    for (let i = currentPosition + 1; i <= totalScreenshots; i++) {
      const state = positionStates[i]
      if (!state || state.status === 'not_visited' || state.status === 'skipped' || state.status === 'correct') {
        return true
      }
    }
    // Check skipped or correct positions from start
    for (let i = 1; i < currentPosition; i++) {
      const state = positionStates[i]
      if (state?.status === 'skipped' || state?.status === 'correct') {
        return true
      }
    }
    return false
  }, [currentPosition, positionStates, totalScreenshots])

  const handlePrevious = () => {
    if (previousPosition) {
      navigateToPosition(previousPosition)
    }
  }

  const handleSkip = () => {
    skipToNextPosition()
  }

  const isDisabled = gamePhase !== 'playing'

  return (
    <div className="flex items-center gap-2">
      {/* Previous button - only show if there are skipped screenshots before current */}
      <Tooltip content={t('game.navigation.previous', 'Previous')}>
        <Button
          variant="ghost"
          size="icon"
          onClick={handlePrevious}
          disabled={isDisabled || !previousPosition}
          className="h-10 w-10"
        >
          <ChevronLeft className="w-5 h-5" />
        </Button>
      </Tooltip>

      {/* Skip/Next button */}
      <Tooltip content={hasNext ? t('game.navigation.skip', 'Skip') : t('game.navigation.finish', 'Finish')}>
        <Button
          variant="ghost"
          size="icon"
          onClick={handleSkip}
          disabled={isDisabled}
          className="h-10 w-10"
        >
          {hasNext ? (
            <SkipForward className="w-5 h-5" />
          ) : (
            <ChevronRight className="w-5 h-5" />
          )}
        </Button>
      </Tooltip>
    </div>
  )
}

/**
 * Compact skip button for inline use in GuessInput
 */
export function SkipButton({
  onSkip,
  disabled,
}: {
  onSkip: () => void
  disabled: boolean
}) {
  const { t } = useTranslation()

  return (
    <Tooltip content={t('game.navigation.skip', 'Skip')}>
      <Button
        variant="gaming"
        size="lg"
        onClick={onSkip}
        disabled={disabled}
        className="h-14 px-6"
      >
        <SkipForward className="w-5 h-5" />
      </Button>
    </Tooltip>
  )
}
