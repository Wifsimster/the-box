import { useEffect } from 'react'
import { motion } from 'framer-motion'
import { useGameStore } from '@/stores/gameStore'
import { cn } from '@/lib/utils'

/**
 * ScoreCountdown displays the countdown score that decreases over time.
 * Replaces the Timer component for the new countdown scoring system.
 */
export function ScoreCountdown() {
  const {
    currentScore,
    initialScore,
    decayRate,
    scoreRunning,
    decrementScore,
    gamePhase,
  } = useGameStore()

  // Score countdown effect
  useEffect(() => {
    if (!scoreRunning || gamePhase !== 'playing') return

    const interval = setInterval(() => {
      decrementScore()
    }, 1000)

    return () => clearInterval(interval)
  }, [scoreRunning, gamePhase, decrementScore])

  // Calculate percentage for visual indicators
  const percentage = (currentScore / initialScore) * 100
  const isWarning = percentage <= 30 && percentage > 10
  const isCritical = percentage <= 10

  // Calculate progress for circular indicator
  const progress = currentScore / initialScore
  const radius = 42
  const strokeWidth = 6
  const normalizedRadius = radius - strokeWidth / 2
  const circumference = 2 * Math.PI * normalizedRadius

  return (
    <motion.div
      className="relative flex items-center justify-center w-24 h-24"
      animate={isCritical ? { scale: [1, 1.05, 1] } : {}}
      transition={{ repeat: Infinity, duration: 0.5 }}
    >
      {/* Circular progress */}
      <svg
        className="absolute inset-0 w-full h-full -rotate-90"
        viewBox="0 0 96 96"
      >
        {/* Background circle */}
        <circle
          cx="48"
          cy="48"
          r={normalizedRadius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          className={cn(
            "opacity-10",
            isCritical ? "text-error" : "text-primary"
          )}
        />
        {/* Progress circle */}
        <motion.circle
          cx="48"
          cy="48"
          r={normalizedRadius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          className={cn(
            isCritical ? "text-error" : isWarning ? "text-warning" : "text-primary"
          )}
          initial={{ strokeDashoffset: 0 }}
          animate={{
            strokeDashoffset: circumference * (1 - progress),
          }}
          style={{
            strokeDasharray: circumference,
          }}
          transition={{ duration: 0.3, ease: "linear" }}
        />
      </svg>

      {/* Background circle for number */}
      <div className="absolute inset-2 rounded-full bg-card/90 backdrop-blur-sm border border-border/50" />

      {/* Score display */}
      <span
        className={cn(
          "text-xl font-bold tabular-nums z-10 relative",
          isCritical && "text-error",
          isWarning && !isCritical && "text-warning",
          !isWarning && !isCritical && "text-foreground"
        )}
      >
        {currentScore}
      </span>
    </motion.div>
  )
}

/**
 * Compact score display variant for inline use
 */
export function ScoreCountdownCompact() {
  const {
    currentScore,
    initialScore,
    decayRate,
    scoreRunning,
    decrementScore,
    gamePhase,
  } = useGameStore()

  // Score countdown effect
  useEffect(() => {
    if (!scoreRunning || gamePhase !== 'playing') return

    const interval = setInterval(() => {
      decrementScore()
    }, 1000)

    return () => clearInterval(interval)
  }, [scoreRunning, gamePhase, decrementScore])

  // Calculate percentage for visual indicators
  const percentage = (currentScore / initialScore) * 100
  const isWarning = percentage <= 30 && percentage > 10
  const isCritical = percentage <= 10

  return (
    <div className="flex items-center gap-2">
      <span className="text-base font-semibold text-white/80 uppercase tracking-wider drop-shadow-lg">
        Points
      </span>
      <motion.div
        className={cn(
          "text-3xl font-black tabular-nums drop-shadow-[0_0_10px_rgba(168,85,247,0.5)]",
          isCritical && "text-error",
          isWarning && !isCritical && "text-warning",
          !isWarning && !isCritical && "text-primary"
        )}
        animate={isCritical ? { scale: [1, 1.05, 1] } : {}}
        transition={{ repeat: Infinity, duration: 0.5 }}
      >
        {currentScore}
      </motion.div>
      <span className="text-sm text-white/50">
        (-{decayRate}/s)
      </span>
    </div>
  )
}
