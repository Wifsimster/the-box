import { motion } from 'framer-motion'

/**
 * PenaltyMessage displays a feedback message after a wrong guess
 * Shows the -100 points penalty with animation
 */
export function PenaltyMessage({ show }: { show: boolean }) {
  if (!show) return null

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="text-center py-2"
    >
      <span className="text-error font-bold text-lg">
        -100 points!
      </span>
    </motion.div>
  )
}
