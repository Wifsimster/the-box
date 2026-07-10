import { db } from '../database/connection.js'
import { repoLogger } from '../logger/logger.js'
import type { GeoGamersSeasonStanding, GeoGamersSeasonMe } from '@the-box/types'

const log = repoLogger.child({ repository: 'geogamers-season' })

// Season parameters. A player's season score drops their N worst days, but
// ONLY once they've played at least MIN_DAYS (until then the raw total stands
// and they're flagged provisional).
export const SEASON_DROP_WORST = 3
export const SEASON_MIN_DAYS_FOR_DROP = 10

/** Current season month (YYYY-MM, UTC). */
export function currentSeasonMonth(referenceMs?: number): string {
  const ref = typeof referenceMs === 'number' ? new Date(referenceMs) : new Date()
  return ref.toISOString().slice(0, 7)
}

/** [start, end) date bounds for a YYYY-MM season, as YYYY-MM-DD strings. */
export function seasonBounds(month: string): { start: string; end: string } {
  const [y, m] = month.split('-').map(Number) as [number, number]
  const start = `${month}-01`
  const nextMonth = m === 12 ? 1 : m + 1
  const nextYear = m === 12 ? y + 1 : y
  const end = `${String(nextYear).padStart(4, '0')}-${String(nextMonth).padStart(2, '0')}-01`
  return { start, end }
}

interface StandingRow {
  user_id: string
  username: string | null
  days_played: string | number
  joker_used: boolean
  raw_total: string | number
  season_score: string | number
  rank: string | number
}

// The shared ranking CTE. Computes each day's rank-from-worst per user, folds
// them into a season score that drops the N worst days once MIN_DAYS is hit,
// then ranks users. Bound parameters keep it injection-safe.
function rankingCte(month: string) {
  const { start, end } = seasonBounds(month)
  return db.raw(
    `
    WITH daily AS (
      SELECT
        r.user_id,
        r.total_points,
        r.joker_used,
        ROW_NUMBER() OVER (
          PARTITION BY r.user_id
          ORDER BY r.total_points ASC, c.challenge_date ASC
        ) AS worst_rank,
        COUNT(*) OVER (PARTITION BY r.user_id) AS days_played
      FROM geogamers_run r
      JOIN geogamers_challenge c ON c.id = r.geogamers_challenge_id
      WHERE r.user_id IS NOT NULL
        AND r.completed_at IS NOT NULL
        AND c.challenge_date >= ? AND c.challenge_date < ?
    ),
    agg AS (
      SELECT
        d.user_id,
        MAX(d.days_played) AS days_played,
        bool_or(d.joker_used) AS joker_used,
        SUM(d.total_points) AS raw_total,
        SUM(d.total_points) FILTER (
          WHERE d.days_played < ? OR d.worst_rank > ?
        ) AS season_score
      FROM daily d
      GROUP BY d.user_id
    ),
    ranked AS (
      SELECT
        a.*,
        ROW_NUMBER() OVER (
          ORDER BY a.season_score DESC, a.raw_total DESC, a.user_id ASC
        ) AS rank
      FROM agg a
    )
    SELECT
      r.user_id,
      COALESCE(u.display_name, u.username, 'Player') AS username,
      r.days_played, r.joker_used, r.raw_total, r.season_score, r.rank
    FROM ranked r
    JOIN "user" u ON u.id = r.user_id
    `,
    [start, end, SEASON_MIN_DAYS_FOR_DROP, SEASON_DROP_WORST],
  )
}

function mapStanding(row: StandingRow): GeoGamersSeasonStanding {
  const daysPlayed = Number(row.days_played)
  const provisional = daysPlayed < SEASON_MIN_DAYS_FOR_DROP
  return {
    userId: row.user_id,
    username: row.username ?? 'Player',
    daysPlayed,
    jokerUsed: !!row.joker_used,
    rawTotal: Number(row.raw_total),
    seasonScore: Number(row.season_score),
    droppedDays: provisional ? 0 : SEASON_DROP_WORST,
    provisional,
    rank: Number(row.rank),
  }
}

export const geoGamersSeasonRepository = {
  currentSeasonMonth,

  async findBySeason(month: string, limit = 100, offset = 0): Promise<GeoGamersSeasonStanding[]> {
    const cte = rankingCte(month)
    const rows = (await db
      .with('leaderboard', cte)
      .select<StandingRow[]>('*')
      .from('leaderboard')
      .orderBy('rank', 'asc')
      .limit(limit)
      .offset(offset)) as StandingRow[]
    return rows.map(mapStanding)
  },

  async findUserSeason(month: string, userId: string): Promise<GeoGamersSeasonMe | null> {
    const cte = rankingCte(month)
    const row = (await db
      .with('leaderboard', cte)
      .select<StandingRow[]>('*')
      .from('leaderboard')
      .where('user_id', userId)
      .first()) as StandingRow | undefined
    if (!row) return null

    const { start, end } = seasonBounds(month)
    const dailyRows = await db('geogamers_run as r')
      .join('geogamers_challenge as c', 'c.id', 'r.geogamers_challenge_id')
      .where('r.user_id', userId)
      .whereNotNull('r.completed_at')
      .andWhere('c.challenge_date', '>=', start)
      .andWhere('c.challenge_date', '<', end)
      .orderBy('c.challenge_date', 'asc')
      .select<
        Array<{
          challenge_date: Date | string
          game_points: number | null
          location_points: number | null
          total_points: number | null
          joker_used: boolean
        }>
      >(
        'c.challenge_date',
        'r.game_points',
        'r.location_points',
        'r.total_points',
        'r.joker_used',
      )

    // Mark the N worst days as dropped (only when past the min-days gate).
    const base = mapStanding(row)
    const sortedByWorst = [...dailyRows]
      .map((d, idx) => ({ d, idx, total: Number(d.total_points ?? 0) }))
      .sort((a, b) => a.total - b.total || a.idx - b.idx)
    const droppedIdx = new Set(
      base.provisional ? [] : sortedByWorst.slice(0, SEASON_DROP_WORST).map((x) => x.idx),
    )

    const dailyBreakdown = dailyRows.map((d, idx) => ({
      date:
        d.challenge_date instanceof Date
          ? d.challenge_date.toISOString().slice(0, 10)
          : String(d.challenge_date).slice(0, 10),
      gamePoints: Number(d.game_points ?? 0),
      locationPoints: Number(d.location_points ?? 0),
      total: Number(d.total_points ?? 0),
      dropped: droppedIdx.has(idx),
      jokerUsed: !!d.joker_used,
    }))

    return { ...base, dailyBreakdown }
  },

  async playerCount(month: string): Promise<number> {
    const { start, end } = seasonBounds(month)
    const res = await db('geogamers_run as r')
      .join('geogamers_challenge as c', 'c.id', 'r.geogamers_challenge_id')
      .whereNotNull('r.user_id')
      .whereNotNull('r.completed_at')
      .andWhere('c.challenge_date', '>=', start)
      .andWhere('c.challenge_date', '<', end)
      .countDistinct<{ count: string }>('r.user_id as count')
      .first()
    return Number(res?.count ?? 0)
  },
}

log.debug('geogamers-season repository initialized')
