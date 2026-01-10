import { db } from '../database/connection.js'
import type { LeaderboardEntry } from '@the-box/types'

interface LeaderboardRow {
  user_id: string
  total_score: number
  completed_at: Date
  username: string
  display_name: string
  avatar_url: string | null
}

export const leaderboardRepository = {
  async findByChallenge(challengeId: number, limit = 100): Promise<LeaderboardEntry[]> {
    const sessions = await db('game_sessions')
      .join('users', 'game_sessions.user_id', 'users.id')
      .where('game_sessions.daily_challenge_id', challengeId)
      .andWhere('game_sessions.is_completed', true)
      .orderBy('game_sessions.total_score', 'desc')
      .limit(limit)
      .select<LeaderboardRow[]>(
        'game_sessions.user_id',
        'game_sessions.total_score',
        'game_sessions.completed_at',
        'users.username',
        'users.display_name',
        'users.avatar_url'
      )

    return sessions.map((session, index) => ({
      rank: index + 1,
      userId: session.user_id,
      username: session.username,
      displayName: session.display_name,
      avatarUrl: session.avatar_url ?? undefined,
      totalScore: session.total_score,
      completedAt: session.completed_at?.toISOString(),
    }))
  },
}
