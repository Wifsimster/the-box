import { motion } from 'framer-motion'
import { useGameStore } from '@/stores/gameStore'
import { cn } from '@/lib/utils'
import type { PositionStatus } from '@/types'

/**
 * ProgressDots displays the status of all screenshots in the challenge.
 * Color coding:
 * - success: correct (guessed correctly)
 * - muted:   unguessed (not visited, skipped, in progress)
 * - primary: current page (with ring + glow)
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
        return 'bg-success'
      default:
        return 'bg-muted'
    }
  }

  const handleDotClick = (position: number) => {
    if (position !== currentPosition) {
      navigateToPosition(position)
    }
  }

  return (
    <div className="flex gap-1 sm:gap-2 md:gap-1.5 bg-black/60 backdrop-blur-md rounded-full px-2 sm:px-4 md:px-3 py-1.5 sm:py-2.5 md:py-2 overflow-x-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] shadow-lg">
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
              "min-w-6 min-h-6 w-6 h-6 sm:w-10 sm:h-10 md:w-7 md:h-7 rounded-full transition-all duration-300 shrink-0 touch-manipulation flex items-center justify-center font-semibold text-[10px] sm:text-sm md:text-[10px]",
              getStatusColor(status),
              isCurrent && "bg-primary ring-2 ring-ring scale-110",
              isClickable && "cursor-pointer hover:scale-125 hover:shadow-lg active:scale-95",
              !isClickable && "cursor-default"
            )}
            style={isCurrent ? { boxShadow: 'var(--glow-md)' } : undefined}
            animate={isCurrent ? { scale: [1, 1.08, 1] } : { scale: 1 }}
            transition={{ duration: 0.6, repeat: isCurrent ? Infinity : 0, repeatDelay: 1.5 }}
            aria-label={`Screenshot ${pos}${isCurrent ? ' (current)' : ''}: ${status}`}
            aria-current={isCurrent ? 'true' : undefined}
          >
            <span className="text-primary-foreground drop-shadow-md">{pos}</span>
          </motion.button>
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
        <span className="text-success text-sm">
          {counts.correct} found
        </span>
      )}
      {counts.skipped > 0 && (
        <span className="text-warning text-sm">
          {counts.skipped} skipped
        </span>
      )}
    </div>
  )
}
