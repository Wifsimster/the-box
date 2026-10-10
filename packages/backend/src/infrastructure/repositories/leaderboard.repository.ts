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
  captures_found: string | null // count comes as string
  avg_capture_time_ms: string | null // AVG comes as string
}

interface MonthlyLeaderboardRow {
  user_id: string
  total_score: string // aggregate sum comes as string
  games_played: string // count comes as string
  username: string | null
  display_name: string | null
  avatar_url: string | null
  captures_found: string | null
  avg_capture_time_ms: string | null
}

// Per-session stats over correct guesses only: how many captures the
// player found and the time spent on the guesses that found them.
// Joined into both boards so each row can show discovery count + speed.
function correctGuessStatsSubquery() {
  return db('guesses')
    .join('tier_sessions', 'guesses.tier_session_id', 'tier_sessions.id')
    .where('guesses.is_correct', true)
    .groupBy('tier_sessions.game_session_id')
    .select(
      'tier_sessions.game_session_id',
      db.raw('COUNT(*) as captures_found'),
      db.raw('SUM(guesses.time_taken_ms) as capture_time_ms')
    )
    .as('guess_stats')
}

export const leaderboardRepository = {
  async findByChallenge(challengeId: number, limit = 100): Promise<LeaderboardEntry[]> {
    // Deterministic tiebreakers: faster finish wins over slower for the
    // same score, then user id breaks any remaining tie so the rendered
    // order is stable across refreshes.
    const sessions = await db('game_sessions')
      .join('user', 'game_sessions.user_id', 'user.id')
      .leftJoin(correctGuessStatsSubquery(), 'guess_stats.game_session_id', 'game_sessions.id')
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
        db.raw('COALESCE(guess_stats.captures_found, 0) as captures_found'),
        db.raw(
          'guess_stats.capture_time_ms / NULLIF(guess_stats.captures_found, 0) as avg_capture_time_ms'
        ),
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
      correctAnswers: Number(session.captures_found ?? 0),
      avgCaptureTimeMs:
        session.avg_capture_time_ms != null
          ? Math.round(Number(session.avg_capture_time_ms))
          : undefined,
      completedAt: session.completed_at?.toISOString(),
    }))
  },

  async countPlayersByChallenge(challengeId: number): Promise<number> {
    // Mirrors the totalPlayers query in getPercentileForScore: ranked
    // sessions only (completed, not catch-up, not anonymous). Used by the
    // public "players today" social-proof badge on the home page.
    const result = await db('game_sessions')
      .join('user', 'game_sessions.user_id', 'user.id')
      .where('game_sessions.daily_challenge_id', challengeId)
      .andWhere('game_sessions.is_completed', true)
      .andWhere('game_sessions.is_catch_up', false)
      .whereRaw('"user"."isAnonymous" = ?', [false])
      .count('game_sessions.id as count')
      .first()
    return Number(result?.count ?? 0)
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

  // Final leaderboard rank for a score on a challenge: 1 + the number of
  // ranked sessions (completed, not catch-up, not anonymous) that scored
  // higher. The public profile / streamer endpoints and the session-completed
  // webhook hook all share this so the ranking rule lives in exactly one
  // place rather than being copy-pasted as a raw query.
  async rankForScore(challengeId: number, score: number): Promise<number> {
    const higher = await db('game_sessions')
      .join('user', 'game_sessions.user_id', 'user.id')
      .where('game_sessions.daily_challenge_id', challengeId)
      .andWhere('game_sessions.is_completed', true)
      .andWhere('game_sessions.is_catch_up', false)
      .whereRaw('"user"."isAnonymous" = ?', [false])
      .andWhere('game_sessions.total_score', '>', score)
      .count<{ count: string }[]>('game_sessions.id as count')
      .first()
    return Number(higher?.count ?? 0) + 1
  },

  async findByMonth(year: number, month: number, limit = 100): Promise<MonthlyLeaderboardEntry[]> {
    const rows = await db('game_sessions')
      .join('user', 'game_sessions.user_id', 'user.id')
      .join('daily_challenges', 'game_sessions.daily_challenge_id', 'daily_challenges.id')
      .leftJoin(correctGuessStatsSubquery(), 'guess_stats.game_session_id', 'game_sessions.id')
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
      .select<(MonthlyLeaderboardRow & { dense_rank: string })[]>(
        'game_sessions.user_id',
        db.raw('SUM(game_sessions.total_score) as total_score'),
        db.raw('COUNT(game_sessions.id) as games_played'),
        db.raw('COALESCE(SUM(guess_stats.captures_found), 0) as captures_found'),
        db.raw(
          'SUM(guess_stats.capture_time_ms) / NULLIF(SUM(guess_stats.captures_found), 0) as avg_capture_time_ms'
        ),
        'user.username',
        'user.display_name',
        'user.avatar_url',
        // DENSE_RANK so tied monthly totals share the same rank, matching
        // the daily board instead of splitting ties by user id.
        db.raw(
          'DENSE_RANK() OVER (ORDER BY SUM(game_sessions.total_score) DESC) as dense_rank'
        )
      )

    return rows.map((row) => ({
      rank: Number(row.dense_rank),
      userId: row.user_id,
      username: row.username ?? 'Anonymous',
      displayName: row.display_name ?? row.username ?? 'Anonymous',
      avatarUrl: row.avatar_url ?? undefined,
      totalScore: Number(row.total_score),
      gamesPlayed: Number(row.games_played),
      correctAnswers: Number(row.captures_found ?? 0),
      avgCaptureTimeMs:
        row.avg_capture_time_ms != null
          ? Math.round(Number(row.avg_capture_time_ms))
          : undefined,
    }))
  },
}

// Type-level check: the repository must satisfy the domain port.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import type { LeaderboardRepository as LeaderboardRepositoryPort } from '../../domain/ports/repositories.js'
export const _leaderboardRepositoryTypeCheck: LeaderboardRepositoryPort = leaderboardRepository
