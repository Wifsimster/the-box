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
  const circumference = 2 * Math.PI * 36 // radius = 36

  return (
    <motion.div
      className={cn(
        "relative flex items-center justify-center",
        "w-24 h-24 rounded-full",
        "bg-card/80 backdrop-blur-sm border-4",
        isWarning && !isCritical && "border-warning",
        isCritical && "border-error",
        !isWarning && !isCritical && "border-primary"
      )}
      animate={isCritical ? { scale: [1, 1.05, 1] } : {}}
      transition={{ repeat: Infinity, duration: 0.5 }}
    >
      {/* Circular progress */}
      <svg className="absolute inset-0 w-full h-full -rotate-90">
        {/* Background circle */}
        <circle
          cx="48"
          cy="48"
          r="36"
          fill="none"
          stroke="currentColor"
          strokeWidth="4"
          className={cn(
            "opacity-20",
            isCritical ? "text-error" : "text-primary"
          )}
        />
        {/* Progress circle */}
        <motion.circle
          cx="48"
          cy="48"
          r="36"
          fill="none"
          stroke="currentColor"
          strokeWidth="4"
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

      {/* Time display */}
      <span
        className={cn(
          "text-3xl font-bold tabular-nums z-10",
          isCritical && "text-error",
          isWarning && !isCritical && "text-warning"
        )}
      >
        {timeRemaining}
      </span>
    </motion.div>
  )
}
