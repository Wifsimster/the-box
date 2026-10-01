import { m } from 'framer-motion'
import { TrendingUp, Users } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Skeleton } from '@/components/ui/skeleton'

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
      <div
        aria-busy="true"
        className="bg-linear-to-r from-neon-purple/10 to-neon-pink/10 border border-neon-purple/30 rounded-xl p-3 sm:p-4"
      >
        <span className="sr-only">{t('common.loading')}</span>
        <div className="flex flex-col items-center gap-2">
          <Skeleton className="h-5 sm:h-6 w-48 max-w-full" />
          <Skeleton className="h-4 w-36 max-w-full" />
        </div>
      </div>
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
      role="status"
      className="bg-linear-to-r from-neon-purple/20 to-neon-pink/20 border border-neon-purple/30 rounded-xl p-3 sm:p-4"
    >
      <div className="flex flex-col items-center gap-1.5 sm:gap-2 text-center">
        <div className="flex items-center gap-1.5 sm:gap-2 text-base sm:text-lg font-bold">
          <TrendingUp className="size-4 sm:size-5 text-neon-purple shrink-0" aria-hidden="true" />
          <span className="gradient-gaming bg-clip-text text-transparent text-sm sm:text-base md:text-lg">
            {t('game.results.percentileTop', { percent: topPercent })}
          </span>
        </div>
        {rank !== null && (
          <div className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm text-muted-foreground">
            <Users className="size-3.5 sm:size-4 shrink-0" aria-hidden="true" />
            <span>
              {t('game.results.rankOf', { rank, total: totalPlayers })}
            </span>
          </div>
        )}
      </div>
    </m.div>
  )
}
