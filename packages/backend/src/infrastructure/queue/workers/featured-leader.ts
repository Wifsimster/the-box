import { db } from '../../database/connection.js'
import { leaderboardService } from '../../../domain/services/index.js'
import { isDisplayNameSafe } from '../../../domain/services/display-name-safety.js'
import { truncateDisplayName } from '../../../domain/services/evening-nudge-copy.js'

/**
 * Resolves today's title holder into the shape outbound nudges actually need,
 * applying the two privacy gates the meeting made launch blockers:
 *   1. the leader's display name must pass {@link isDisplayNameSafe};
 *   2. the leader must not have opted out via `feature_in_notifications`.
 *
 * When either gate fails we still surface the (public) score so callers can
 * fall back to score-only copy — only the *name* is withheld.
 *
 * Shared by the evening-nudge push worker and the streak-risk email worker so
 * the gate is applied identically in both places.
 */
export interface FeaturedLeader {
  /** Rank-1 user id, or null when nobody has played today. */
  userId: string | null
  /** Today's top score, or null when nobody has played today. */
  score: number | null
  /** Safe, truncated name to feature, or null (unsafe / opted out / empty). */
  safeName: string | null
}

const EMPTY: FeaturedLeader = { userId: null, score: null, safeName: null }

export async function loadFeaturedLeader(): Promise<FeaturedLeader> {
  const leader = await leaderboardService.getTodayLeader()
  if (!leader) return EMPTY

  if (!isDisplayNameSafe(leader.displayName)) {
    return { userId: leader.userId, score: leader.totalScore, safeName: null }
  }

  const row = await db('user')
    .where('id', leader.userId)
    .select<{ feature_in_notifications: boolean }>('feature_in_notifications')
    .first()
  const optedOut = row?.feature_in_notifications === false

  return {
    userId: leader.userId,
    score: leader.totalScore,
    safeName: optedOut ? null : truncateDisplayName(leader.displayName),
  }
}
