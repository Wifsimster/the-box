import { db } from '../database/connection.js'
import type { LeaderboardEntry, PercentileResponse } from '@the-box/types'

interface LeaderboardRow {
  user_id: string
  total_score: number
  completed_at: Date
  username: string | null
  displayName: string | null
  avatarUrl: string | null
}

export const leaderboardRepository = {
  async findByChallenge(challengeId: number, limit = 100): Promise<LeaderboardEntry[]> {
    const sessions = await db('game_sessions')
      .join('user', 'game_sessions.user_id', 'user.id')
      .where('game_sessions.daily_challenge_id', challengeId)
      .andWhere('game_sessions.is_completed', true)
      .orderBy('game_sessions.total_score', 'desc')
      .limit(limit)
      .select<LeaderboardRow[]>(
        'game_sessions.user_id',
        'game_sessions.total_score',
        'game_sessions.completed_at',
        'user.username',
        'user.displayName',
        'user.avatarUrl'
      )

    return sessions.map((session, index) => ({
      rank: index + 1,
      userId: session.user_id,
      username: session.username ?? 'Anonymous',
      displayName: session.displayName ?? session.username ?? 'Anonymous',
      avatarUrl: session.avatarUrl ?? undefined,
      totalScore: session.total_score,
      completedAt: session.completed_at?.toISOString(),
    }))
  },

  async getPercentileForScore(challengeId: number, score: number): Promise<PercentileResponse> {
    // Count total completed sessions for this challenge
    const totalResult = await db('game_sessions')
      .where('daily_challenge_id', challengeId)
      .andWhere('is_completed', true)
      .count('id as count')
      .first()

    const totalPlayers = Number(totalResult?.count ?? 0)

    if (totalPlayers === 0) {
      return { percentile: 100, totalPlayers: 0, rank: 1 }
    }

    // Count players with score higher than the given score (to determine rank)
    const higherScoreResult = await db('game_sessions')
      .where('daily_challenge_id', challengeId)
      .andWhere('is_completed', true)
      .andWhere('total_score', '>', score)
      .count('id as count')
      .first()

    const playersAbove = Number(higherScoreResult?.count ?? 0)
    const rank = playersAbove + 1

    // Calculate percentile: what percentage of players scored lower
    // percentile = (players with lower score / total players) * 100
    const playersBelow = totalPlayers - rank
    const percentile = Math.round((playersBelow / totalPlayers) * 100)

    return { percentile, totalPlayers, rank }
  },
}
