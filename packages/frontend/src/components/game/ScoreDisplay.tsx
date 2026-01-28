import { motion, AnimatePresence } from 'framer-motion'
import { useGameStore } from '@/stores/gameStore'
import { useEffect, useState } from 'react'

export function ScoreDisplay() {
  const { totalScore } = useGameStore()
  const [prevScore, setPrevScore] = useState(totalScore)
  const [isAnimating, setIsAnimating] = useState(false)

  useEffect(() => {
    if (totalScore !== prevScore) {
      setIsAnimating(true)
      const timer = setTimeout(() => {
        setPrevScore(totalScore)
        setIsAnimating(false)
      }, 300)
      return () => clearTimeout(timer)
    }
  }, [totalScore, prevScore])

  return (
    <div className="flex flex-col items-center">
      <span className="text-[10px] sm:text-xs font-medium text-white/50 uppercase tracking-widest">
        Score
      </span>
      <AnimatePresence mode="popLayout">
        <motion.div
          key={totalScore}
          initial={{ opacity: 0, y: -10, scale: 0.8 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 10, scale: 0.8 }}
          transition={{ type: 'spring', stiffness: 500, damping: 30 }}
          className="text-2xl sm:text-3xl font-bold tabular-nums text-white tracking-tight"
        >
          {totalScore || 0}
        </motion.div>
      </AnimatePresence>
    </div>
  )
}
