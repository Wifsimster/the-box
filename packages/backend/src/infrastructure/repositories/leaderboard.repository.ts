import { db } from '../database/connection.js'
import type { LeaderboardEntry } from '@the-box/types'

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
}
