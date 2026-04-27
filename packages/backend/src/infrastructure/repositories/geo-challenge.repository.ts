import { db } from '../database/connection.js'
import { repoLogger } from '../logger/logger.js'
import type { GeoChallenge, GeoGuessResult, GeoLeaderboardEntry, GeoPoint } from '@the-box/types'

const log = repoLogger.child({ repository: 'geo-challenge' })

export interface GeoChallengeRow {
  id: number
  challenge_date: Date
  geo_screenshot_meta_id: number
  tier: number
  is_current: boolean
  created_at: Date
}

export interface GeoGuessRow {
  id: number
  user_id: string
  geo_challenge_id: number
  x: number
  y: number
  distance: number
  score: number
  score_version: number
  duration_ms: number | null
  is_skip: boolean
  created_at: Date
}

function mapChallenge(row: GeoChallengeRow): GeoChallenge {
  return {
    id: row.id,
    challengeDate:
      row.challenge_date instanceof Date
        ? row.challenge_date.toISOString().slice(0, 10)
        : String(row.challenge_date),
    geoScreenshotMetaId: row.geo_screenshot_meta_id,
    tier: row.tier,
  }
}

export const geoChallengeRepository = {
  // ---- Challenges ----

  async findByDate(date: string, tier = 1): Promise<GeoChallenge | null> {
    const row = await db('geo_challenge')
      .where({ challenge_date: date, tier })
      .first<GeoChallengeRow>()
    return row ? mapChallenge(row) : null
  },

  async findCurrent(tier = 1): Promise<GeoChallenge | null> {
    const row = await db('geo_challenge')
      .where({ is_current: true, tier })
      .first<GeoChallengeRow>()
    return row ? mapChallenge(row) : null
  },

  async listRecent(days: number): Promise<GeoChallenge[]> {
    const rows = await db('geo_challenge')
      .where('challenge_date', '>=', db.raw(`CURRENT_DATE - INTERVAL '${days} days'`))
      .orderBy('challenge_date', 'desc')
      .select<GeoChallengeRow[]>('*')
    return rows.map(mapChallenge)
  },

  async create(data: {
    challengeDate: string
    geoScreenshotMetaId: number
    tier?: number
  }): Promise<GeoChallenge> {
    log.info({ date: data.challengeDate }, 'create geo challenge')
    const [row] = await db('geo_challenge')
      .insert({
        challenge_date: data.challengeDate,
        geo_screenshot_meta_id: data.geoScreenshotMetaId,
        tier: data.tier ?? 1,
      })
      .returning<GeoChallengeRow[]>('*')
    return mapChallenge(row!)
  },

  // Atomically promote `challengeId` to current and demote any existing
  // current row in the same tier. Wrapped in a transaction because the
  // partial unique index `geo_challenge_one_current_per_tier` would
  // otherwise reject the second statement if run independently.
  async setCurrent(args: { challengeId: number; tier?: number }): Promise<void> {
    const tier = args.tier ?? 1
    log.info({ challengeId: args.challengeId, tier }, 'setCurrent')
    await db.transaction(async (trx) => {
      await trx('geo_challenge')
        .where({ tier, is_current: true })
        .whereNot('id', args.challengeId)
        .update({ is_current: false })
      await trx('geo_challenge')
        .where({ id: args.challengeId, tier })
        .update({ is_current: true })
    })
  },

  // ---- Guesses ----

  async findGuess(userId: string, challengeId: number): Promise<GeoGuessRow | null> {
    const row = await db('geo_guess')
      .where({ user_id: userId, geo_challenge_id: challengeId })
      .first<GeoGuessRow>()
    return row ?? null
  },

  async recordGuess(data: {
    userId: string
    geoChallengeId: number
    guess: GeoPoint
    distance: number
    score: number
    scoreVersion: number
    durationMs?: number
  }): Promise<GeoGuessResult> {
    log.info(
      { userId: data.userId, challengeId: data.geoChallengeId, score: data.score },
      'recordGuess',
    )

    await db('geo_guess').insert({
      user_id: data.userId,
      geo_challenge_id: data.geoChallengeId,
      x: data.guess.x,
      y: data.guess.y,
      distance: data.distance,
      score: data.score,
      score_version: data.scoreVersion,
      duration_ms: data.durationMs ?? null,
    })

    const meta = await db('geo_challenge')
      .join(
        'geo_screenshot_meta',
        'geo_challenge.geo_screenshot_meta_id',
        'geo_screenshot_meta.id',
      )
      .where('geo_challenge.id', data.geoChallengeId)
      .select<{ canonical_x: number; canonical_y: number }>(
        'geo_screenshot_meta.canonical_x',
        'geo_screenshot_meta.canonical_y',
      )
      .first()

    return {
      guess: data.guess,
      canonical: { x: meta?.canonical_x ?? 0, y: meta?.canonical_y ?? 0 },
      distance: data.distance,
      score: data.score,
      scoreVersion: data.scoreVersion,
    }
  },

  // Records a "skip" — the player declared they don't recognize the
  // game. Stored in `geo_guess` with `is_skip = true` so the PK
  // `(user_id, geo_challenge_id)` keeps locking the daily slot
  // (preventing skip-then-guess), but excluded from `getChallengeStats`
  // and never upserted to the leaderboards.
  async recordSkip(data: { userId: string; geoChallengeId: number }): Promise<void> {
    log.info({ userId: data.userId, challengeId: data.geoChallengeId }, 'recordSkip')
    await db('geo_guess').insert({
      user_id: data.userId,
      geo_challenge_id: data.geoChallengeId,
      x: 0,
      y: 0,
      distance: 0,
      score: 0,
      score_version: 0,
      duration_ms: null,
      is_skip: true,
    })
  },

  // ---- Challenge stats ----

  // Average + player count across all *attempted* guesses for the
  // challenge — skips are excluded so the comparison the player sees
  // reflects only people who actually tried, not people who passed.
  async getChallengeStats(
    challengeId: number,
  ): Promise<{ averageScore: number; playerCount: number }> {
    const row = await db('geo_guess')
      .where({ geo_challenge_id: challengeId, is_skip: false })
      .select<{ avg: string | null; count: string | null }>(
        db.raw('AVG(score) AS avg'),
        db.raw('COUNT(*) AS count'),
      )
      .first()
    const playerCount = Number(row?.count ?? 0)
    const averageScore = playerCount > 0 ? Math.round(Number(row?.avg ?? 0)) : 0
    return { averageScore, playerCount }
  },

  // ---- Leaderboards ----

  async upsertDaily(args: {
    challengeDate: string
    userId: string
    score: number
  }): Promise<void> {
    await db.raw(
      `
      INSERT INTO geo_leaderboard_daily (challenge_date, user_id, score, updated_at)
      VALUES (?, ?, ?, NOW())
      ON CONFLICT (challenge_date, user_id)
      DO UPDATE SET score = GREATEST(geo_leaderboard_daily.score, EXCLUDED.score),
                    updated_at = NOW()
      `,
      [args.challengeDate, args.userId, args.score],
    )
  },

  async upsertMonthly(args: { period: string; userId: string; scoreDelta: number }): Promise<void> {
    await db.raw(
      `
      INSERT INTO geo_leaderboard_monthly (period, user_id, score, updated_at)
      VALUES (?, ?, ?, NOW())
      ON CONFLICT (period, user_id)
      DO UPDATE SET score = geo_leaderboard_monthly.score + EXCLUDED.score,
                    updated_at = NOW()
      `,
      [args.period, args.userId, args.scoreDelta],
    )
  },

  async topDaily(challengeDate: string, limit = 50): Promise<GeoLeaderboardEntry[]> {
    const rows: LeaderboardJoinRow[] = await db('geo_leaderboard_daily')
      .join('user', 'geo_leaderboard_daily.user_id', 'user.id')
      .where('geo_leaderboard_daily.challenge_date', challengeDate)
      .orderBy('geo_leaderboard_daily.score', 'desc')
      .limit(limit)
      .select(
        'geo_leaderboard_daily.user_id',
        'user.username',
        'user.display_name',
        'user.avatar_url',
        'geo_leaderboard_daily.score',
      )

    return rows.map(mapLeaderboardRow)
  },

  async topMonthly(period: string, limit = 50): Promise<GeoLeaderboardEntry[]> {
    const rows: LeaderboardJoinRow[] = await db('geo_leaderboard_monthly')
      .join('user', 'geo_leaderboard_monthly.user_id', 'user.id')
      .where('geo_leaderboard_monthly.period', period)
      .orderBy('geo_leaderboard_monthly.score', 'desc')
      .limit(limit)
      .select(
        'geo_leaderboard_monthly.user_id',
        'user.username',
        'user.display_name',
        'user.avatar_url',
        'geo_leaderboard_monthly.score',
      )

    return rows.map(mapLeaderboardRow)
  },
}

interface LeaderboardJoinRow {
  user_id: string
  username: string
  display_name: string
  avatar_url: string | null
  score: number
}

function mapLeaderboardRow(r: LeaderboardJoinRow, i: number): GeoLeaderboardEntry {
  return {
    userId: r.user_id,
    username: r.username,
    displayName: r.display_name,
    avatarUrl: r.avatar_url ?? undefined,
    score: r.score,
    rank: i + 1,
  }
}
