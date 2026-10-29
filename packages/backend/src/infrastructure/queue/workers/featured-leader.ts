import { db } from '../../database/connection.js'
import {
  leaderboardService,
} from '../../../composition/services.js'
import { isDisplayNameSafe } from '../../../domain/services/display-name-safety.js'
import { truncateDisplayName } from '../../../domain/services/evening-nudge-copy.js'

export interface FeaturedLeader {
  userId: string | null
  score: number | null
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
