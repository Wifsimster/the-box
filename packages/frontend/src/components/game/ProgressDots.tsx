import { m } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import { Check, X } from 'lucide-react'
import { useGameStore } from '@/stores/gameStore'
import { useReducedMotionSafe } from '@/hooks/useReducedMotionSafe'
import { cn } from '@/lib/utils'
import type { PositionStatus } from '@/types'

/** Background colour class for a position dot based on its status. */
function getStatusColor(status: PositionStatus) {
  switch (status) {
    case 'correct':
      return 'bg-success'
    case 'timed_out':
      return 'bg-error'
    default:
      return 'bg-muted'
  }
}

/**
 * Non-colour badge for a resolved position. Colour alone carried found-vs-missed
 * here, which `docs/oxygen-design-system.md` §2.1 forbids: the dot is the only
 * at-a-glance record of how the run is going, and green/red is exactly the pair
 * that fails for the most common colour-vision deficiency.
 *
 * Decorative: the status is already spelled out in each button's aria-label.
 */
function StatusBadge({ status }: { status: PositionStatus }) {
  if (status !== 'correct' && status !== 'timed_out') return null
  const Icon = status === 'correct' ? Check : X
  return (
    <span
      aria-hidden="true"
      className={cn(
        // Dark chip with a coloured glyph, not a same-colour chip: on a green
        // or red dot the badge has to read as a distinct object, and this way
        // the SHAPE carries the meaning and colour merely reinforces it.
        'absolute -right-1 -top-1 grid size-3.5 place-items-center rounded-full',
        'bg-background ring-1 ring-background',
        status === 'correct' ? 'text-success' : 'text-error',
      )}
    >
      <Icon className="size-2.5" strokeWidth={3.5} />
    </span>
  )
}

/**
 * ProgressDots displays the status of all screenshots in the challenge.
 * Color coding:
 * - success: correct (guessed correctly)
 * - muted:   unguessed (not visited, skipped, in progress)
 * - primary: current page (with ring + glow)
 */
export function ProgressDots() {
  const { t } = useTranslation()
  const prefersReducedMotion = useReducedMotionSafe()
  const {
    positionStates,
    currentPosition,
    totalScreenshots,
    navigateToPosition,
  } = useGameStore()

  const handleDotClick = (position: number) => {
    // Timed-out positions are locked (permanent miss) — not navigable.
    if (position !== currentPosition && positionStates[position]?.status !== 'timed_out') {
      navigateToPosition(position)
    }
  }

  return (
    <div
      role="group"
      aria-label={t('game.progressDots.label')}
      className="flex gap-1.5 sm:gap-2 bg-black/60 backdrop-blur-md rounded-full px-2.5 sm:px-3 py-1.5 sm:py-2 overflow-x-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] shadow-lg max-w-full"
    >
      {Array.from({ length: totalScreenshots }, (_, i) => {
        const pos = i + 1
        const state = positionStates[pos]
        const status = state?.status ?? 'not_visited'
        const isCurrent = pos === currentPosition
        const isClickable = pos !== currentPosition && status !== 'timed_out'

        return (
          <m.button
            key={pos}
            type="button"
            onClick={() => handleDotClick(pos)}
            disabled={!isClickable}
            className={cn(
              // Outer tap area guarantees ~44px target on mobile without crowding the visual
              "relative shrink-0 p-1.5 sm:p-1 -m-1 touch-manipulation rounded-full",
              isClickable && "cursor-pointer active:scale-95",
              !isClickable && "cursor-default"
            )}
            animate={isCurrent && !prefersReducedMotion ? { scale: [1, 1.08, 1] } : { scale: 1 }}
            transition={
              isCurrent && !prefersReducedMotion
                ? { duration: 0.6, repeat: Infinity, repeatDelay: 1.5 }
                : { duration: 0.2 }
            }
            aria-label={t(isCurrent ? 'game.progressDots.itemCurrent' : 'game.progressDots.item', {
              position: pos,
              status: t(`game.progressDots.status.${status}`),
            })}
            aria-current={isCurrent ? 'true' : undefined}
          >
            <span
              className={cn(
                "relative flex items-center justify-center rounded-full font-semibold text-[11px] sm:text-xs transition-all duration-300",
                "size-7 sm:size-8",
                getStatusColor(status),
                isCurrent && "bg-primary ring-2 ring-ring",
                isClickable && "hover:brightness-125"
              )}
              style={isCurrent ? { boxShadow: 'var(--glow-md)' } : undefined}
            >
              <span className="text-primary-foreground drop-shadow-md tabular-nums">{pos}</span>
              {/* Anchored to the visible circle, not the button — the button
                  carries padding, which would park the badge out in the gap. */}
              <StatusBadge status={status} />
            </span>
          </m.button>
        )
      })}
    </div>
  )
}
