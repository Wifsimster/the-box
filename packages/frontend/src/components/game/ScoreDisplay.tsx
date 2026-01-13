import { motion } from 'framer-motion'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Info } from 'lucide-react'
import { Tooltip } from '@/components/ui/tooltip'
import { useGameStore } from '@/stores/gameStore'
import { cn } from '@/lib/utils'

export function ScoreDisplay() {
  const { t } = useTranslation()
  const {
    totalScore,
  } = useGameStore()

  const tooltipContent = (
    <div className="flex flex-col gap-1 p-1 min-w-45">
      <span className="font-semibold text-primary border-b border-border pb-1 mb-1">
        {t('game.scoring.title')}
      </span>
      <span>• {t('game.scoring.basePoints')}</span>
      <span>• {t('game.scoring.speedMultiplier')}</span>
      <span>• {t('game.scoring.unlimitedTries')}</span>
      <span>• {t('game.scoring.penalty')}</span>
    </div>
  )

  return (
    <div className="flex items-center gap-1.5 sm:gap-2">
      <Tooltip content={tooltipContent} side="bottom" contentClassName="text-left">
        <span className="text-xs sm:text-sm md:text-base font-semibold text-white/80 uppercase tracking-wider drop-shadow-lg flex items-center gap-0.5 sm:gap-1 cursor-help">
          Score
          <Info className="h-3 w-3 sm:h-4 sm:w-4 text-white/50 hover:text-white/80 transition-colors" />
        </span>
      </Tooltip>
      <motion.div
        className="text-xl sm:text-2xl md:text-3xl font-black tabular-nums text-primary drop-shadow-[0_0_10px_rgba(168,85,247,0.5)]"
      >
        {totalScore || 0}
      </motion.div>
    </div>
  )
}
