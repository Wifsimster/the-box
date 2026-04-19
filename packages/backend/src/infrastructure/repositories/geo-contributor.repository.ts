import { db } from '../database/connection.js'
import { repoLogger } from '../logger/logger.js'
import type {
  GeoContributorStats,
  GeoContributorTier,
  GeoContributorTierThreshold,
} from '@the-box/types'

const log = repoLogger.child({ repository: 'geo-contributor' })

export interface GeoContributorStatsRow {
  user_id: string
  tier: GeoContributorTier
  total_submitted: number
  total_accepted: number
  total_rejected: number
  accuracy: number
  shadow_banned: boolean
  tier_promoted_at: Date | null
  updated_at: Date
}

export interface GeoContributorTierThresholdRow {
  tier: GeoContributorTier
  min_accepted: number
  min_accuracy: number
  display_order: number
}

function mapStats(row: GeoContributorStatsRow): GeoContributorStats {
  return {
    userId: row.user_id,
    tier: row.tier,
    totalSubmitted: row.total_submitted,
    totalAccepted: row.total_accepted,
    totalRejected: row.total_rejected,
    accuracy: row.accuracy,
    shadowBanned: row.shadow_banned,
    tierPromotedAt: row.tier_promoted_at?.toISOString(),
  }
}

function mapThreshold(row: GeoContributorTierThresholdRow): GeoContributorTierThreshold {
  return {
    tier: row.tier,
    minAccepted: row.min_accepted,
    minAccuracy: row.min_accuracy,
    displayOrder: row.display_order,
  }
}

export const geoContributorRepository = {
  async getStats(userId: string): Promise<GeoContributorStats | null> {
    const row = await db('geo_contributor_stats')
      .where({ user_id: userId })
      .first<GeoContributorStatsRow>()
    return row ? mapStats(row) : null
  },

  /**
   * Atomically bump submitted/accepted/rejected counters. The `accuracy`
   * column is recomputed server-side to stay consistent with the counts.
   */
  async bumpCounters(args: {
    userId: string
    submittedDelta: number
    acceptedDelta: number
    rejectedDelta: number
  }): Promise<void> {
    log.debug(args, 'bumpCounters')

    await db.raw(
      `
      INSERT INTO geo_contributor_stats
        (user_id, total_submitted, total_accepted, total_rejected, accuracy, updated_at)
      VALUES (?, ?, ?, ?, CASE WHEN ? = 0 THEN 0 ELSE ?::float / ? END, NOW())
      ON CONFLICT (user_id) DO UPDATE SET
        total_submitted = geo_contributor_stats.total_submitted + EXCLUDED.total_submitted,
        total_accepted  = geo_contributor_stats.total_accepted  + EXCLUDED.total_accepted,
        total_rejected  = geo_contributor_stats.total_rejected  + EXCLUDED.total_rejected,
        accuracy = CASE
          WHEN (geo_contributor_stats.total_submitted + EXCLUDED.total_submitted) = 0 THEN 0
          ELSE (geo_contributor_stats.total_accepted + EXCLUDED.total_accepted)::float
               / (geo_contributor_stats.total_submitted + EXCLUDED.total_submitted)
        END,
        updated_at = NOW()
      `,
      [
        args.userId,
        args.submittedDelta,
        args.acceptedDelta,
        args.rejectedDelta,
        args.submittedDelta,
        args.acceptedDelta,
        args.submittedDelta,
      ],
    )
  },

  async setTier(userId: string, tier: GeoContributorTier): Promise<void> {
    log.info({ userId, tier }, 'setTier')
    await db('geo_contributor_stats')
      .where({ user_id: userId })
      .update({ tier, tier_promoted_at: db.fn.now(), updated_at: db.fn.now() })
  },

  async setShadowBanned(userId: string, shadowBanned: boolean): Promise<void> {
    log.warn({ userId, shadowBanned }, 'setShadowBanned')
    await db('geo_contributor_stats')
      .where({ user_id: userId })
      .update({ shadow_banned: shadowBanned, updated_at: db.fn.now() })
  },

  async listThresholds(): Promise<GeoContributorTierThreshold[]> {
    const rows = await db('geo_contributor_tier_threshold')
      .orderBy('display_order', 'asc')
      .select<GeoContributorTierThresholdRow[]>('*')
    return rows.map(mapThreshold)
  },
}
