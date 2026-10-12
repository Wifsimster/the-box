import { db } from '../database/connection.js'
import { isCountryCode, type LeaderboardEntry, type MonthlyLeaderboardEntry } from '@the-box/types'
import type { CountryPlayerMonthStats } from '../../domain/services/country-leaderboard.js'
import type { SessionStandingCounts, StandingCounts } from '../../domain/services/leaderboard-standing.js'

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
    // Mirrors the ranked-session filter in countStandingForScore: ranked
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

  async countGuestPlayersByChallenge(challengeId: number): Promise<number> {
    // Same session filter as the ranked board, but for guests: they finished
    // today's box without an account, so they stay off the board. The daily
    // board shows the count ("+ N guests also played").
    const result = await db('game_sessions')
      .join('user', 'game_sessions.user_id', 'user.id')
      .where('game_sessions.daily_challenge_id', challengeId)
      .andWhere('game_sessions.is_completed', true)
      .andWhere('game_sessions.is_catch_up', false)
      .whereRaw('"user"."isAnonymous" = ?', [true])
      .count('game_sessions.id as count')
      .first()
    return Number(result?.count ?? 0)
  },

  async countStandingForScore(challengeId: number, score: number): Promise<StandingCounts> {
    // One statement for both counts (ranked sessions: completed, not
    // catch-up, not anonymous), so rank and total come from the same
    // snapshot. Two separate COUNTs let a session completing in between
    // push the rank past the total.
    const { rows } = await db.raw<{ rows: Array<{ ranked_players: string; players_above: string }> }>(
      `select count(*) as ranked_players,
              count(*) filter (where gs.total_score > ?) as players_above
         from game_sessions gs
         join "user" u on u.id = gs.user_id
        where gs.daily_challenge_id = ?
          and gs.is_completed = true
          and gs.is_catch_up = false
          and u."isAnonymous" = false`,
      [score, challengeId]
    )
    return {
      rankedPlayers: Number(rows[0]?.ranked_players ?? 0),
      playersAbove: Number(rows[0]?.players_above ?? 0),
    }
  },

  async findSessionStandingCounts(sessionId: string, userId: string): Promise<SessionStandingCounts | null> {
    // Places the session by its *stored* score on its own challenge, in one
    // statement: the score, the ranked total, the players above and whether
    // the session itself is among the ranked rows all read from one snapshot.
    // A client-supplied score (possibly stale on another device) never enters.
    const { rows } = await db.raw<{
      rows: Array<{ id: string; total_score: number; ranked_players: string; players_above: string; self_counted: boolean | null }>
    }>(
      `with me as (
         select id, daily_challenge_id, total_score
           from game_sessions
          where id = ? and user_id = ?
       )
       select me.id,
              me.total_score,
              count(r.id) as ranked_players,
              count(r.id) filter (where r.total_score > me.total_score) as players_above,
              coalesce(bool_or(r.id = me.id), false) as self_counted
         from me
         left join (
           select gs.id, gs.daily_challenge_id, gs.total_score
             from game_sessions gs
             join "user" u on u.id = gs.user_id
            where gs.is_completed = true
              and gs.is_catch_up = false
              and u."isAnonymous" = false
         ) r on r.daily_challenge_id = me.daily_challenge_id
        group by me.id, me.total_score`,
      [sessionId, userId]
    )
    const row = rows[0]
    if (!row) return null
    return {
      sessionId: row.id,
      totalScore: Number(row.total_score),
      rankedPlayers: Number(row.ranked_players),
      playersAbove: Number(row.players_above),
      selfCounted: row.self_counted === true,
    }
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

  async findCountryPlayerStatsByMonth(year: number, month: number): Promise<CountryPlayerMonthStats[]> {
    const rows = await db('game_sessions')
      .join('user', 'game_sessions.user_id', 'user.id')
      .join('daily_challenges', 'game_sessions.daily_challenge_id', 'daily_challenges.id')
      .where('game_sessions.is_completed', true)
      .andWhere('game_sessions.is_catch_up', false)
      .whereRaw('"user"."isAnonymous" = ?', [false])
      .whereNotNull('user.country')
      .whereRaw('EXTRACT(YEAR FROM daily_challenges.challenge_date) = ?', [year])
      .whereRaw('EXTRACT(MONTH FROM daily_challenges.challenge_date) = ?', [month])
      .groupBy('game_sessions.user_id', 'user.country')
      .select<{ user_id: string; country: string; games_played: string; total_score: string }[]>(
        'game_sessions.user_id',
        'user.country',
        db.raw('COUNT(game_sessions.id) as games_played'),
        db.raw('SUM(game_sessions.total_score) as total_score')
      )

    return rows.flatMap((row) =>
      isCountryCode(row.country)
        ? [
            {
              userId: row.user_id,
              countryCode: row.country,
              gamesPlayed: Number(row.games_played),
              totalScore: Number(row.total_score),
            },
          ]
        : []
    )
  },
}

// Type-level check: the repository must satisfy the domain port.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import type { LeaderboardRepository as LeaderboardRepositoryPort } from '../../domain/ports/repositories.js'
export const _leaderboardRepositoryTypeCheck: LeaderboardRepositoryPort = leaderboardRepository
