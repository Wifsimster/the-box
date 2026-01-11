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
    initialScore,
    decayRate,
    scoreRunning,
    sessionStartedAt,
    gamePhase,
  } = useGameStore()

  // Tick counter to force re-renders every second
  const [, setTick] = useState(0)

  // Timer effect to trigger re-renders for score updates
  useEffect(() => {
    if (!scoreRunning || gamePhase !== 'playing') return

    const interval = setInterval(() => {
      setTick(t => t + 1)
    }, 1000)

    return () => clearInterval(interval)
  }, [scoreRunning, gamePhase])

  // Calculate current score from actual elapsed time (authoritative)
  const calculateCurrentScore = () => {
    if (!sessionStartedAt || !initialScore) return initialScore || 0
    const elapsedMs = Date.now() - sessionStartedAt
    const elapsedSeconds = Math.floor(elapsedMs / 1000)
    return Math.max(0, initialScore - (elapsedSeconds * (decayRate || 2)))
  }

  const currentScore = calculateCurrentScore()

  // Calculate percentage for color states
  const percentage = initialScore > 0 ? (currentScore / initialScore) * 100 : 100
  const isWarning = percentage <= 30 && percentage > 10
  const isCritical = percentage <= 10

  const tooltipContent = (
    <div className="flex flex-col gap-1 p-1 min-w-45">
      <span className="font-semibold text-primary border-b border-border pb-1 mb-1">
        {t('game.scoring.title')}
      </span>
      <span>• {t('game.scoring.countdown', { initial: initialScore || 1000 })}</span>
      <span>• {t('game.scoring.decay', { rate: decayRate || 2 })}</span>
      <span>• {t('game.scoring.lock')}</span>
      <span>• {t('game.scoring.penalty')}</span>
    </div>
  )

  return (
    <div className="flex items-center gap-2">
      <Tooltip content={tooltipContent} side="bottom" contentClassName="text-left">
        <span className="text-base font-semibold text-white/80 uppercase tracking-wider drop-shadow-lg flex items-center gap-1 cursor-help">
          Score
          <Info className="w-4 h-4 text-white/50 hover:text-white/80 transition-colors" />
        </span>
      </Tooltip>
      <motion.div
        className={cn(
          "text-3xl font-black tabular-nums",
          isCritical && "text-error drop-shadow-[0_0_10px_rgba(239,68,68,0.5)]",
          isWarning && !isCritical && "text-warning drop-shadow-[0_0_10px_rgba(245,158,11,0.5)]",
          !isWarning && !isCritical && "text-primary drop-shadow-[0_0_10px_rgba(168,85,247,0.5)]"
        )}
        animate={isCritical ? { scale: [1, 1.05, 1] } : {}}
        transition={{ repeat: Infinity, duration: 0.5 }}
      >
        {currentScore}
      </motion.div>
    </div>
  )
}
