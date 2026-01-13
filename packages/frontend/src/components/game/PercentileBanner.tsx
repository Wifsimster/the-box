import { motion } from 'framer-motion'
import { TrendingUp, Users } from 'lucide-react'
import { useTranslation } from 'react-i18next'

interface PercentileBannerProps {
  percentile: number | null
  rank: number | null
  totalPlayers: number | null
  isLoading?: boolean
}

/**
 * Banner component displaying the user's percentile ranking
 */
export function PercentileBanner({
  percentile,
  rank,
  totalPlayers,
  isLoading = false,
}: PercentileBannerProps) {
  const { t } = useTranslation()

  if (isLoading) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-gradient-to-r from-neon-purple/20 to-neon-pink/20 border border-neon-purple/30 rounded-lg sm:rounded-xl p-3 sm:p-4 mb-4 sm:mb-6"
      >
        <div className="flex items-center justify-center gap-2">
          <div className="w-3 h-3 sm:w-4 sm:h-4 border-2 border-neon-purple border-t-transparent rounded-full animate-spin" />
          <span className="text-muted-foreground text-xs sm:text-sm">{t('common.loading')}</span>
        </div>
      </motion.div>
    )
  }

  if (percentile === null || totalPlayers === null || totalPlayers === 0) {
    return null
  }

  // Calculate "top X%" - if percentile is 85, user is in top 15%
  const topPercent = Math.max(1, 100 - percentile)

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.5 }}
      className="bg-gradient-to-r from-neon-purple/20 to-neon-pink/20 border border-neon-purple/30 rounded-lg sm:rounded-xl p-3 sm:p-4 mb-4 sm:mb-6"
    >
      <div className="flex flex-col items-center gap-1.5 sm:gap-2">
        <div className="flex items-center gap-1.5 sm:gap-2 text-base sm:text-lg font-bold">
          <TrendingUp className="w-4 h-4 sm:w-5 sm:h-5 text-neon-purple shrink-0" />
          <span className="bg-gradient-to-r from-neon-purple to-neon-pink bg-clip-text text-transparent text-sm sm:text-base md:text-lg">
            {t('game.results.percentileTop', { percent: topPercent })}
          </span>
        </div>
        {rank !== null && (
          <div className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm text-muted-foreground">
            <Users className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
            <span>
              {t('game.results.rankOf', { rank, total: totalPlayers })}
            </span>
          </div>
        )}
      </div>
    </motion.div>
  )
}
