import { motion, AnimatePresence } from 'framer-motion'
import { useGameStore } from '@/stores/gameStore'

export function ScoreDisplay() {
  const { totalScore } = useGameStore()

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
