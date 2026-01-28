import { motion } from 'framer-motion'
import { useGameStore } from '@/stores/gameStore'

export function ScoreDisplay() {
  const { totalScore } = useGameStore()

  return (
    <div className="flex items-center gap-1.5 sm:gap-2">
      <span className="text-xs sm:text-sm md:text-base font-semibold text-purple-200/80 uppercase tracking-wider drop-shadow-lg">
        Score
      </span>
      <motion.div
        className="text-xl sm:text-2xl md:text-3xl font-extrabold tabular-nums bg-gradient-to-r from-neon-purple to-neon-pink bg-clip-text text-transparent drop-shadow-[0_0_10px_rgba(168,85,247,0.5)] tracking-tight"
        style={{ fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif' }}
      >
        {totalScore || 0}
      </motion.div>
    </div>
  )
}
