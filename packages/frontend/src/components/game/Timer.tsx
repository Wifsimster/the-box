import { useEffect } from 'react'
import { motion } from 'framer-motion'
import { useGameStore } from '@/stores/gameStore'
import { cn } from '@/lib/utils'

export function Timer() {
  const {
    timeRemaining,
    timerRunning,
    decrementTimer,
    gamePhase,
  } = useGameStore()

  // Timer countdown effect
  useEffect(() => {
    if (!timerRunning || gamePhase !== 'playing') return

    const interval = setInterval(() => {
      decrementTimer()
    }, 1000)

    return () => clearInterval(interval)
  }, [timerRunning, gamePhase, decrementTimer])

  const isWarning = timeRemaining <= 10 && timeRemaining > 5
  const isCritical = timeRemaining <= 5

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  // Calculate progress for circular indicator
  const progress = timeRemaining / 30 // Assuming 30s default
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

      {/* Time display */}
      <span
        className={cn(
          "text-3xl font-bold tabular-nums z-10 relative",
          isCritical && "text-error",
          isWarning && !isCritical && "text-warning",
          !isWarning && !isCritical && "text-foreground"
        )}
      >
        {timeRemaining}
      </span>
    </motion.div>
  )
}
