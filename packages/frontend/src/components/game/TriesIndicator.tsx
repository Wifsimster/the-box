import { motion } from 'framer-motion'
import { useGameStore } from '@/stores/gameStore'
import { cn } from '@/lib/utils'

/**
 * TriesIndicator displays the remaining tries for the current screenshot.
 * Shows dots that fill/empty based on tries used.
 */
export function TriesIndicator() {
  const { triesRemaining, maxTriesPerScreenshot } = useGameStore()

  return (
    <div className="flex items-center gap-2">
      <span className="text-sm font-medium text-white/70 uppercase tracking-wider">
        Tries
      </span>
      <div className="flex gap-1.5">
        {Array.from({ length: maxTriesPerScreenshot }).map((_, i) => {
          const isActive = i < triesRemaining
          return (
            <motion.div
              key={i}
              className={cn(
                "w-3 h-3 rounded-full transition-colors duration-300",
                isActive
                  ? "bg-primary shadow-[0_0_8px_rgba(168,85,247,0.6)]"
                  : "bg-muted/50 border border-border"
              )}
              initial={{ scale: 0.8 }}
              animate={{
                scale: isActive ? 1 : 0.8,
                opacity: isActive ? 1 : 0.5,
              }}
              transition={{ duration: 0.2 }}
            />
          )
        })}
      </div>
    </div>
  )
}

/**
 * Compact tries indicator showing as text
 */
export function TriesIndicatorCompact() {
  const { triesRemaining, maxTriesPerScreenshot } = useGameStore()

  const isLow = triesRemaining === 1
  const isOut = triesRemaining === 0

  return (
    <div className="flex items-center gap-1">
      <span
        className={cn(
          "text-lg font-bold tabular-nums",
          isOut && "text-error",
          isLow && !isOut && "text-warning",
          !isLow && !isOut && "text-foreground"
        )}
      >
        {triesRemaining}
      </span>
      <span className="text-sm text-white/50">
        /{maxTriesPerScreenshot} tries
      </span>
    </div>
  )
}

/**
 * Feedback message shown after incorrect guess
 */
export function TryAgainMessage({ show }: { show: boolean }) {
  const { triesRemaining } = useGameStore()

  if (!show || triesRemaining === 0) return null

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="text-center py-2"
    >
      <span className="text-warning font-semibold">
        Wrong guess!{' '}
        <span className="text-foreground">
          {triesRemaining} {triesRemaining === 1 ? 'try' : 'tries'} remaining
        </span>
      </span>
    </motion.div>
  )
}
