import { m } from 'framer-motion'
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
      <m.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-linear-to-r from-neon-purple/20 to-neon-pink/20 border border-neon-purple/30 rounded-lg sm:rounded-xl p-3 sm:p-4 mb-4 sm:mb-6"
      >
        <div className="flex items-center justify-center gap-2">
          <div className="size-3 sm:size-4 border-2 border-neon-purple border-t-transparent rounded-full animate-spin" />
          <span className="text-muted-foreground text-xs sm:text-sm">{t('common.loading')}</span>
        </div>
      </m.div>
    )
  }

  if (percentile === null || totalPlayers === null || totalPlayers === 0) {
    return null
  }

  // Backend already returns "top X%" semantics (1 = best player, 100 = worst).
  // Just clamp to a sensible minimum for display.
  const topPercent = Math.max(1, percentile)

  return (
    <m.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.5 }}
      className="bg-linear-to-r from-neon-purple/20 to-neon-pink/20 border border-neon-purple/30 rounded-lg sm:rounded-xl p-3 sm:p-4 mb-4 sm:mb-6"
    >
      <div className="flex flex-col items-center gap-1.5 sm:gap-2">
        <div className="flex items-center gap-1.5 sm:gap-2 text-base sm:text-lg font-bold">
          <TrendingUp className="size-4 sm:size-5 text-neon-purple shrink-0" />
          <span className="gradient-gaming bg-clip-text text-transparent text-sm sm:text-base md:text-lg">
            {t('game.results.percentileTop', { percent: topPercent })}
          </span>
        </div>
        {rank !== null && (
          <div className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm text-muted-foreground">
            <Users className="size-3.5 sm:size-4 shrink-0" />
            <span>
              {t('game.results.rankOf', { rank, total: totalPlayers })}
            </span>
          </div>
        )}
      </div>
    </m.div>
  )
}
