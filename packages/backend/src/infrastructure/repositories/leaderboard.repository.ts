import { db } from '../database/connection.js'
import type { LeaderboardEntry, PercentileResponse, MonthlyLeaderboardEntry } from '@the-box/types'

interface LeaderboardRow {
  user_id: string
  session_id: string
  total_score: number
  completed_at: Date
  username: string | null
  display_name: string | null
  avatar_url: string | null
}

interface MonthlyLeaderboardRow {
  user_id: string
  total_score: string // aggregate sum comes as string
  games_played: string // count comes as string
  username: string | null
  display_name: string | null
  avatar_url: string | null
}

export const leaderboardRepository = {
  async findByChallenge(challengeId: number, limit = 100): Promise<LeaderboardEntry[]> {
    // Deterministic tiebreakers: faster finish wins over slower for the
    // same score, then user id breaks any remaining tie so the rendered
    // order is stable across refreshes.
    const sessions = await db('game_sessions')
      .join('user', 'game_sessions.user_id', 'user.id')
      .where('game_sessions.daily_challenge_id', challengeId)
      .andWhere('game_sessions.is_completed', true)
      .andWhere('game_sessions.is_catch_up', false) // Exclude catch-up sessions from leaderboard
      .whereRaw('"user"."isAnonymous" = ?', [false])
      .orderBy([
        { column: 'game_sessions.total_score', order: 'desc' },
        { column: 'game_sessions.completed_at', order: 'asc' },
        { column: 'game_sessions.user_id', order: 'asc' },
      ])
      .limit(limit)
      .select<(LeaderboardRow & { dense_rank: string })[]>(
        'game_sessions.id as session_id',
        'game_sessions.user_id',
        'game_sessions.total_score',
        'game_sessions.completed_at',
        'user.username',
        'user.display_name',
        'user.avatar_url',
        // DENSE_RANK so tied scores share the same rank instead of
        // pushing the rest of the board down a slot.
        db.raw(
          'DENSE_RANK() OVER (ORDER BY game_sessions.total_score DESC) as dense_rank'
        )
      )

    return sessions.map((session) => ({
      rank: Number(session.dense_rank),
      userId: session.user_id,
      sessionId: session.session_id,
      username: session.username ?? 'Anonymous',
      displayName: session.display_name ?? session.username ?? 'Anonymous',
      avatarUrl: session.avatar_url ?? undefined,
      totalScore: session.total_score,
      completedAt: session.completed_at?.toISOString(),
    }))
  },

  async getPercentileForScore(challengeId: number, score: number): Promise<PercentileResponse> {
    // Count total completed sessions for this challenge (excluding anonymous users and catch-up sessions)
    const totalResult = await db('game_sessions')
      .join('user', 'game_sessions.user_id', 'user.id')
      .where('game_sessions.daily_challenge_id', challengeId)
      .andWhere('game_sessions.is_completed', true)
      .andWhere('game_sessions.is_catch_up', false) // Exclude catch-up sessions
      .whereRaw('"user"."isAnonymous" = ?', [false])
      .count('game_sessions.id as count')
      .first()

    const totalPlayers = Number(totalResult?.count ?? 0)

    if (totalPlayers === 0) {
      return { percentile: 100, totalPlayers: 0, rank: 1 }
    }

    // Count players with score higher than the given score (to determine rank)
    const higherScoreResult = await db('game_sessions')
      .join('user', 'game_sessions.user_id', 'user.id')
      .where('game_sessions.daily_challenge_id', challengeId)
      .andWhere('game_sessions.is_completed', true)
      .andWhere('game_sessions.is_catch_up', false) // Exclude catch-up sessions
      .whereRaw('"user"."isAnonymous" = ?', [false])
      .andWhere('game_sessions.total_score', '>', score)
      .count('game_sessions.id as count')
      .first()

    const playersAbove = Number(higherScoreResult?.count ?? 0)
    const rank = playersAbove + 1

    // Calculate top percentile: what top percentage the player is in
    // Top 1% = best player, Top 100% = worst player
    const topPercentile = Math.max(1, Math.round((rank / totalPlayers) * 100))

    return { percentile: topPercentile, totalPlayers, rank }
  },

  async findByMonth(year: number, month: number, limit = 100): Promise<MonthlyLeaderboardEntry[]> {
    const rows = await db('game_sessions')
      .join('user', 'game_sessions.user_id', 'user.id')
      .join('daily_challenges', 'game_sessions.daily_challenge_id', 'daily_challenges.id')
      .where('game_sessions.is_completed', true)
      .andWhere('game_sessions.is_catch_up', false) // Exclude catch-up sessions from monthly leaderboard
      .whereRaw('"user"."isAnonymous" = ?', [false])
      .whereRaw('EXTRACT(YEAR FROM daily_challenges.challenge_date) = ?', [year])
      .whereRaw('EXTRACT(MONTH FROM daily_challenges.challenge_date) = ?', [month])
      .groupBy('game_sessions.user_id', 'user.username', 'user.display_name', 'user.avatar_url')
      // Stable monthly ordering — tie on summed score breaks on user id so
      // refreshes don't shuffle rows.
      .orderByRaw('SUM(game_sessions.total_score) DESC, game_sessions.user_id ASC')
      .limit(limit)
      .select<MonthlyLeaderboardRow[]>(
        'game_sessions.user_id',
        db.raw('SUM(game_sessions.total_score) as total_score'),
        db.raw('COUNT(game_sessions.id) as games_played'),
        'user.username',
        'user.display_name',
        'user.avatar_url'
      )

    return rows.map((row, index) => ({
      rank: index + 1,
      userId: row.user_id,
      username: row.username ?? 'Anonymous',
      displayName: row.display_name ?? row.username ?? 'Anonymous',
      avatarUrl: row.avatar_url ?? undefined,
      totalScore: Number(row.total_score),
      gamesPlayed: Number(row.games_played),
    }))
  },
}

// Type-level check: the repository must satisfy the domain port.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import type { LeaderboardRepository as LeaderboardRepositoryPort } from '../../domain/ports/repositories.js'
export const _leaderboardRepositoryTypeCheck: LeaderboardRepositoryPort = leaderboardRepository
