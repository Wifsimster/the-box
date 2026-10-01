import { m, AnimatePresence } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import { useGameStore } from '@/stores/gameStore'

export function ScoreDisplay() {
  const { t } = useTranslation()
  const totalScore = useGameStore((s) => s.totalScore)

  return (
    <div className="flex flex-col items-center">
      <span className="text-xs font-medium text-muted-foreground uppercase tracking-widest">
        {t('game.score')}
      </span>
      <AnimatePresence mode="popLayout">
        <m.div
          key={totalScore}
          initial={{ opacity: 0, y: -10, scale: 0.8 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 10, scale: 0.8 }}
          transition={{ type: 'spring', stiffness: 500, damping: 30 }}
          className="text-2xl sm:text-3xl font-bold tabular-nums text-foreground tracking-tight"
        >
          {totalScore || 0}
        </m.div>
      </AnimatePresence>
    </div>
  )
}
