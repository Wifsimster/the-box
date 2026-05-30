import { motion } from 'framer-motion'
import { useTranslation } from 'react-i18next'
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
  const { t } = useTranslation()
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
    <div
      role="tablist"
      aria-label={t('game.progressDots.label')}
      className="flex gap-1.5 sm:gap-2 bg-black/60 backdrop-blur-md rounded-full px-2.5 sm:px-3 py-1.5 sm:py-2 overflow-x-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] shadow-lg max-w-full"
    >
      {Array.from({ length: totalScreenshots }, (_, i) => {
        const pos = i + 1
        const state = positionStates[pos]
        const status = state?.status ?? 'not_visited'
        const isCurrent = pos === currentPosition
        const isClickable = pos !== currentPosition

        return (
          <motion.button
            key={pos}
            role="tab"
            onClick={() => handleDotClick(pos)}
            disabled={!isClickable}
            className={cn(
              // Outer tap area guarantees ~44px target on mobile without crowding the visual
              "relative shrink-0 p-1.5 sm:p-1 -m-1 touch-manipulation rounded-full",
              isClickable && "cursor-pointer active:scale-95",
              !isClickable && "cursor-default"
            )}
            animate={isCurrent ? { scale: [1, 1.08, 1] } : { scale: 1 }}
            transition={{ duration: 0.6, repeat: isCurrent ? Infinity : 0, repeatDelay: 1.5 }}
            aria-label={t(isCurrent ? 'game.progressDots.itemCurrent' : 'game.progressDots.item', {
              position: pos,
              status: t(`game.progressDots.status.${status}`),
            })}
            aria-current={isCurrent ? 'true' : undefined}
          >
            <span
              className={cn(
                "flex items-center justify-center rounded-full font-semibold text-[11px] sm:text-xs transition-all duration-300",
                "size-7 sm:size-8",
                getStatusColor(status),
                isCurrent && "bg-primary ring-2 ring-ring",
                isClickable && "hover:brightness-125"
              )}
              style={isCurrent ? { boxShadow: 'var(--glow-md)' } : undefined}
            >
              <span className="text-primary-foreground drop-shadow-md tabular-nums">{pos}</span>
            </span>
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
  const { t } = useTranslation()
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
          {t('game.progressDots.summary.found', { count: counts.correct })}
        </span>
      )}
      {counts.skipped > 0 && (
        <span className="text-warning text-sm">
          {t('game.progressDots.summary.skipped', { count: counts.skipped })}
        </span>
      )}
    </div>
  )
}
