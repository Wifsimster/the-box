import { motion } from 'framer-motion'
import { useGameStore } from '@/stores/gameStore'
import { cn } from '@/lib/utils'
import type { PositionStatus } from '@/types'

/**
 * ProgressDots displays the status of all screenshots in the challenge.
 * Color coding:
 * - Green: correct (guessed correctly)
 * - Yellow: skipped (not yet attempted)
 * - Gray: not visited (haven't reached yet)
 * - Ring highlight on current position
 */
export function ProgressDots() {
  const {
    positionStates,
    currentPosition,
    totalScreenshots,
    navigateToPosition,
    canNavigateTo,
  } = useGameStore()

  const getStatusColor = (status: PositionStatus) => {
    switch (status) {
      case 'correct':
        return 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]'
      case 'skipped':
        return 'bg-yellow-500 shadow-[0_0_8px_rgba(234,179,8,0.6)]'
      case 'in_progress':
        return 'bg-primary shadow-[0_0_8px_rgba(168,85,247,0.6)]'
      default:
        return 'bg-gray-600'
    }
  }

  const handleDotClick = (position: number) => {
    if (canNavigateTo(position) && position !== currentPosition) {
      navigateToPosition(position)
    }
  }

  return (
    <div className="flex gap-2 bg-black/50 backdrop-blur-sm rounded-full px-4 py-2">
      {Array.from({ length: totalScreenshots }, (_, i) => {
        const pos = i + 1
        const state = positionStates[pos]
        const status = state?.status ?? 'not_visited'
        const isCurrent = pos === currentPosition
        const isClickable = canNavigateTo(pos) && pos !== currentPosition

        return (
          <motion.button
            key={pos}
            onClick={() => handleDotClick(pos)}
            disabled={!isClickable}
            className={cn(
              "w-3 h-3 rounded-full transition-all duration-300",
              getStatusColor(status),
              isCurrent && "ring-2 ring-white ring-offset-1 ring-offset-transparent",
              isClickable && "cursor-pointer hover:scale-125",
              !isClickable && pos !== currentPosition && "cursor-not-allowed opacity-80"
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
