import { motion } from 'framer-motion'
import { useGameStore } from '@/stores/gameStore'
import { cn } from '@/lib/utils'
import type { PositionStatus } from '@/types'

/**
 * ProgressDots displays the status of all screenshots in the challenge.
 * Color coding:
 * - Green: correct (guessed correctly)
 * - Gray: unguessed pages (not visited, skipped, in progress)
 * - White border: current page indicator
 */
export function ProgressDots() {
  const {
    positionStates,
    currentPosition,
    totalScreenshots,
    navigateToPosition,
  } = useGameStore()

  const getStatusColor = (status: PositionStatus) => {
    switch (status) {
      case 'correct':
        return 'bg-green-500'
      default:
        return 'bg-gray-600'
    }
  }

  const handleDotClick = (position: number) => {
    if (position !== currentPosition) {
      navigateToPosition(position)
    }
  }

  return (
    <div className="flex gap-1 sm:gap-1.5 md:gap-2 bg-black/50 backdrop-blur-sm rounded-full px-2 sm:px-3 md:px-4 py-1.5 sm:py-2 overflow-x-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
      {Array.from({ length: totalScreenshots }, (_, i) => {
        const pos = i + 1
        const state = positionStates[pos]
        const status = state?.status ?? 'not_visited'
        const isCurrent = pos === currentPosition
        const isClickable = pos !== currentPosition

        return (
          <motion.button
            key={pos}
            onClick={() => handleDotClick(pos)}
            disabled={!isClickable}
            className={cn(
              "w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full transition-all duration-300 flex-shrink-0 touch-manipulation",
              getStatusColor(status),
              isCurrent && "ring-2 ring-white ring-offset-1",
              isClickable && "cursor-pointer hover:scale-125 active:scale-110"
            )}
            animate={isCurrent ? { scale: [1, 1.15, 1] } : { scale: 1 }}
            transition={{ duration: 0.5, repeat: isCurrent ? Infinity : 0, repeatDelay: 1 }}
            aria-label={`Screenshot ${pos}: ${status}`}
          />
        )
      })}
    </div>
  )
}

/**
 * Compact progress indicator showing current/total with dots
 */
export function ProgressDotsCompact() {
  const { positionStates, currentPosition, totalScreenshots } = useGameStore()

  // Count by status
  const counts = {
    correct: 0,
    skipped: 0,
  }

  Object.values(positionStates).forEach((state) => {
    if (state.status === 'correct') counts.correct++
    else if (state.status === 'skipped') counts.skipped++
  })

  return (
    <div className="flex items-center gap-3">
      <span className="text-lg font-bold tabular-nums">
        {currentPosition}/{totalScreenshots}
      </span>
      {counts.correct > 0 && (
        <span className="text-green-500 text-sm">
          {counts.correct} found
        </span>
      )}
      {counts.skipped > 0 && (
        <span className="text-yellow-500 text-sm">
          {counts.skipped} skipped
        </span>
      )}
    </div>
  )
}
