import { db } from '../database/connection.js'
import type {
  AdvancedStatsAggregates,
  InventoryBadgeRow,
  PublicProfileAggregates,
  RecentSessionRow,
  HintUsageAggregates,
  MonthlyScoreRow,
  PlayerStatsRepository,
  ScoreAggregates,
  SolveTimeAggregates,
} from '../../domain/ports/player-stats.js'

const RETIRED_METADATA_HINTS = [
  'hint_year',
  'hint_publisher',
  'hint_developer',
  'hint_genre',
] as const

function startOfMonthsAgo(monthsBack: number): Date {
  const start = new Date()
  start.setMonth(start.getMonth() - monthsBack)
  start.setDate(1)
  start.setHours(0, 0, 0, 0)
  return start
}

export const playerStatsRepository: PlayerStatsRepository = {
  async fetchPublicProfileAggregates(
    userId: string,
    recentLimit: number
  ): Promise<PublicProfileAggregates> {
    const [recentRows, gamesPlayedRow, badgeRows] = await Promise.all([
      db('game_sessions')
        .where('user_id', userId)
        .andWhere('is_completed', true)
        .orderBy('completed_at', 'desc')
        .limit(recentLimit)
        .select<Array<{ total_score: number; completed_at: Date | null; daily_challenge_id: number }>>(
          'total_score',
          'completed_at',
          'daily_challenge_id',
        ),
      db('game_sessions')
        .where('user_id', userId)
        .andWhere('is_completed', true)
        .count<{ count: string }[]>('id as count')
        .first(),
      db('user_inventory')
        .where('user_id', userId)
        .andWhere('item_type', 'badge')
        .andWhere('quantity', '>', 0)
        .select<InventoryBadgeRow[]>('item_key', 'quantity'),
    ])

    const challengeIds = recentRows.map((r) => r.daily_challenge_id)
    const challengeRows = challengeIds.length
      ? await db('daily_challenges')
          .whereIn('id', challengeIds)
          .select<Array<{ id: number; challenge_date: string }>>(
            'id',
            db.raw('challenge_date::text as challenge_date'),
          )
      : []
    const dateById = new Map(challengeRows.map((c) => [c.id, c.challenge_date]))

    const recentSessions: RecentSessionRow[] = recentRows.map((row) => ({
      challengeDate: dateById.get(row.daily_challenge_id) ?? '',
      totalScore: row.total_score,
      completedAt: row.completed_at,
    }))

    return {
      gamesPlayed: gamesPlayedRow?.count ?? 0,
      recentSessions,
      badges: badgeRows,
    }
  },

  async fetchAdvancedStats(
    userId: string,
    monthsOfHistory: number
  ): Promise<AdvancedStatsAggregates> {
    const historyStart = startOfMonthsAgo(Math.max(0, monthsOfHistory - 1))

    const [scoreRow, timeRow, legacyHintRow, letterRow, monthlyRows] = await Promise.all([
      db('game_sessions')
        .where({ user_id: userId, is_completed: true, is_catch_up: false })
        .select<ScoreAggregates>(
          db.raw('MAX(total_score) as best'),
          db.raw('AVG(total_score) as avg'),
          db.raw('COUNT(*) as total'),
          db.raw('COUNT(*) FILTER (WHERE total_score - streak_bonus_total = 2000) as perfect'),
        )
        .first(),

      db('guesses')
        .join('tier_sessions', 'guesses.tier_session_id', 'tier_sessions.id')
        .join('game_sessions', 'tier_sessions.game_session_id', 'game_sessions.id')
        .where('game_sessions.user_id', userId)
        .andWhere('game_sessions.is_completed', true)
        .andWhere('game_sessions.is_catch_up', false)
        .andWhere('guesses.is_correct', true)
        .select<SolveTimeAggregates>(
          db.raw('PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY guesses.time_taken_ms) as p25'),
          db.raw('PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY guesses.time_taken_ms) as median'),
          db.raw('PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY guesses.time_taken_ms) as p75'),
          db.raw('AVG(guesses.time_taken_ms) as mean'),
        )
        .first(),

      db('guesses')
        .join('tier_sessions', 'guesses.tier_session_id', 'tier_sessions.id')
        .join('game_sessions', 'tier_sessions.game_session_id', 'game_sessions.id')
        .where('game_sessions.user_id', userId)
        .whereIn('guesses.power_up_used', [...RETIRED_METADATA_HINTS])
        .count<{ count: string }>({ count: '*' })
        .first(),

      db('position_letter_reveals')
        .join('tier_sessions', 'position_letter_reveals.tier_session_id', 'tier_sessions.id')
        .join('game_sessions', 'tier_sessions.game_session_id', 'game_sessions.id')
        .where('game_sessions.user_id', userId)
        .sum<{ sum: string | null }>('position_letter_reveals.letters_revealed as sum')
        .first(),

      db('game_sessions')
        .where({ user_id: userId, is_completed: true, is_catch_up: false })
        .andWhere('completed_at', '>=', historyStart)
        .groupByRaw("to_char(date_trunc('month', completed_at), 'YYYY-MM')")
        .orderByRaw("to_char(date_trunc('month', completed_at), 'YYYY-MM') ASC")
        .select<MonthlyScoreRow[]>(
          db.raw("to_char(date_trunc('month', completed_at), 'YYYY-MM') as month"),
          db.raw('SUM(total_score) as total'),
          db.raw('COUNT(*) as sessions'),
        ),
    ])

    const hintUsage: HintUsageAggregates = {
      lettersRevealed: letterRow?.sum ?? 0,
      legacyMetadataHints: legacyHintRow?.count ?? 0,
    }

    return {
      scores: scoreRow ?? null,
      solveTimes: timeRow ?? null,
      hintUsage,
      monthlyScores: monthlyRows,
    }
  },
}
