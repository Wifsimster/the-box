import { motion } from 'framer-motion'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useGameStore } from '@/stores/gameStore'
import { cn } from '@/lib/utils'

export function ScoreDisplay() {
  const { t } = useTranslation()
  const {
    totalScore,
  } = useGameStore()

  return (
    <div className="flex items-center gap-1.5 sm:gap-2">
      <span className="text-xs sm:text-sm md:text-base font-semibold text-white/80 uppercase tracking-wider drop-shadow-lg">
        Score
      </span>
      <motion.div
        className="text-xl sm:text-2xl md:text-3xl font-black tabular-nums text-primary drop-shadow-[0_0_10px_rgba(168,85,247,0.5)]"
      >
        {totalScore || 0}
      </motion.div>
    </div>
  )
}
