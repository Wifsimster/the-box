import { motion, AnimatePresence } from 'framer-motion'
import { useState, useEffect } from 'react'

interface ScoreDisplayProps {
  score: number
}

export function ScoreDisplay({ score }: ScoreDisplayProps) {
  const [displayScore, setDisplayScore] = useState(score)
  const [isAnimating, setIsAnimating] = useState(false)

  useEffect(() => {
    if (score !== displayScore) {
      setIsAnimating(true)

      // Animate score counting up
      const diff = score - displayScore
      const duration = 500 // ms
      const steps = 20
      const increment = diff / steps
      const stepDuration = duration / steps

      let currentStep = 0
      const interval = setInterval(() => {
        currentStep++
        if (currentStep >= steps) {
          setDisplayScore(score)
          setIsAnimating(false)
          clearInterval(interval)
        } else {
          setDisplayScore((prev) => Math.round(prev + increment))
        }
      }, stepDuration)

      return () => clearInterval(interval)
    }
  }, [score, displayScore])

  return (
    <div className="flex items-center gap-2">
      <span className="text-sm text-muted-foreground uppercase tracking-wide">Score</span>
      <motion.div
        className="text-2xl font-bold text-primary tabular-nums"
        animate={isAnimating ? { scale: [1, 1.2, 1] } : {}}
        transition={{ duration: 0.3 }}
      >
        {displayScore}
      </motion.div>
    </div>
  )
}
