import type { DomainLogger } from '../ports/logger.js'
import type { GeoContributorRepository } from '../ports/repositories.js'
import type {
  GeoContributorStats,
  GeoContributorTier,
  GeoContributorTierThreshold,
} from '@the-box/types'

export interface GeoTierEvaluation {
  previousTier: GeoContributorTier
  newTier: GeoContributorTier
  promoted: boolean
}

export interface GeoContributorService {
  /**
   * Given current stats, pick the highest tier whose cutoffs are met.
   * Tiers in the threshold table are ordered by `display_order` ascending,
   * so we iterate and keep the last match.
   */
  pickTier(
    stats: Pick<GeoContributorStats, 'totalAccepted' | 'accuracy'>,
    thresholds: GeoContributorTierThreshold[],
  ): GeoContributorTier

  /**
   * Load current stats + thresholds, evaluate, and persist a tier change
   * if one is warranted. Never downgrades a user who has crossed upward.
   */
  evaluateAndMaybePromote(userId: string): Promise<GeoTierEvaluation | null>
}

export interface GeoContributorServiceDeps {
  logger: DomainLogger
  geoContributorRepository: GeoContributorRepository
}

const TIER_ORDER: GeoContributorTier[] = ['bronze', 'silver', 'gold', 'diamond']

function tierRank(tier: GeoContributorTier): number {
  return TIER_ORDER.indexOf(tier)
}

export function createGeoContributorService(
  deps: GeoContributorServiceDeps,
): GeoContributorService {
  const { geoContributorRepository } = deps
  const log = deps.logger.child({ service: 'geo-contributor' })

  return {
    pickTier(stats, thresholds) {
      const sorted = [...thresholds].sort((a, b) => a.displayOrder - b.displayOrder)
      let chosen: GeoContributorTier = 'bronze'
      for (const t of sorted) {
        if (stats.totalAccepted >= t.minAccepted && stats.accuracy >= t.minAccuracy) {
          chosen = t.tier
        }
      }
      return chosen
    },

    async evaluateAndMaybePromote(userId) {
      const stats = await geoContributorRepository.getStats(userId)
      if (!stats) return null

      const thresholds = await geoContributorRepository.listThresholds()
      const previousTier = stats.tier
      const computed = this.pickTier(
        { totalAccepted: stats.totalAccepted, accuracy: stats.accuracy },
        thresholds,
      )

      // Never downgrade; only promote when computed rank exceeds current.
      if (tierRank(computed) <= tierRank(previousTier)) {
        return { previousTier, newTier: previousTier, promoted: false }
      }

      log.info({ userId, from: previousTier, to: computed }, 'promote tier')
      await geoContributorRepository.setTier(userId, computed)
      return { previousTier, newTier: computed, promoted: true }
    },
  }
}
