import { db } from '../database/connection.js'
import type { Game, Screenshot } from '@the-box/types'
import type { TierScreenshotWithGame } from '../../domain/ports/repositories.js'

export interface ChallengeRow {
  id: number
  challenge_date: string
  created_at: Date
}

export interface TierRow {
  id: number
  daily_challenge_id: number
  tier_number: number
  name: string
  time_limit_seconds: number
}

export interface TierScreenshotRow {
  position: number
  bonus_multiplier: string
  screenshot_id: number
  image_url: string
}

export const challengeRepository = {
  async findById(id: number): Promise<ChallengeRow | null> {
    // Cast `challenge_date::text` so the column comes back as a 'YYYY-MM-DD'
    // string instead of the JS Date that node-pg's default DATE parser
    // produces. Callers compare it with strict equality against ISO date
    // strings (anti-cheat gate in user.service.ts), and a Date !== string
    // mismatch silently disables those checks.
    const row = await db('daily_challenges')
      .where('id', id)
      .select('id', db.raw('challenge_date::text as challenge_date'), 'created_at')
      .first<ChallengeRow>()
    return row ?? null
  },

  async findByDate(date: string): Promise<ChallengeRow | null> {
    const row = await db('daily_challenges')
      .where('challenge_date', date)
      .select('id', db.raw('challenge_date::text as challenge_date'), 'created_at')
      .first<ChallengeRow>()
    return row ?? null
  },

  async findTiersByChallenge(challengeId: number): Promise<TierRow[]> {
    return await db('tiers')
      .where('daily_challenge_id', challengeId)
      .orderBy('tier_number', 'asc')
      .select<TierRow[]>('*')
  },

  async findTierById(tierId: number): Promise<TierRow | null> {
    return await db('tiers').where('id', tierId).first<TierRow>()
  },

  async findTierByNumber(challengeId: number, tierNumber: number): Promise<TierRow | null> {
    return await db('tiers')
      .where('daily_challenge_id', challengeId)
      .andWhere('tier_number', tierNumber)
      .first<TierRow>()
  },

  async findScreenshotAtPosition(tierId: number, position: number): Promise<TierScreenshotRow | null> {
    const row = await db('tier_screenshots')
      .join('screenshots', 'tier_screenshots.screenshot_id', 'screenshots.id')
      .where('tier_screenshots.tier_id', tierId)
      .andWhere('tier_screenshots.position', position)
      .select<TierScreenshotRow>(
        'tier_screenshots.position',
        'tier_screenshots.bonus_multiplier',
        'screenshots.id as screenshot_id',
        'screenshots.image_url'
      )
      .first()
    return row ?? null
  },

  async findAll(): Promise<ChallengeRow[]> {
    return await db('daily_challenges')
      .orderBy('challenge_date', 'desc')
      .select<ChallengeRow[]>('*')
  },

  async create(challengeDate: string): Promise<ChallengeRow> {
    const [row] = await db('daily_challenges')
      .insert({ challenge_date: challengeDate })
      .returning<ChallengeRow[]>('*')
    return row!
  },

  async createTier(data: {
    dailyChallengeId: number
    tierNumber: number
    name: string
    timeLimitSeconds: number
  }): Promise<TierRow> {
    const [row] = await db('tiers')
      .insert({
        daily_challenge_id: data.dailyChallengeId,
        tier_number: data.tierNumber,
        name: data.name,
        time_limit_seconds: data.timeLimitSeconds,
      })
      .returning<TierRow[]>('*')
    return row!
  },

  async createTierScreenshots(tierId: number, screenshotIds: number[]): Promise<void> {
    const data = screenshotIds.map((screenshotId, index) => ({
      tier_id: tierId,
      screenshot_id: screenshotId,
      position: index + 1,
    }))
    await db('tier_screenshots').insert(data)
  },

  async deleteTierScreenshots(tierId: number): Promise<number> {
    return await db('tier_screenshots')
      .where('tier_id', tierId)
      .del()
  },

  async findRecentChallenges(days: number): Promise<ChallengeRow[]> {
    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - days)
    const cutoffStr = cutoffDate.toISOString().split('T')[0]

    const rows = await db.raw<{ rows: ChallengeRow[] }>(`
      SELECT id, challenge_date::text as challenge_date, created_at
      FROM daily_challenges
      WHERE challenge_date >= ?
      ORDER BY challenge_date DESC
    `, [cutoffStr])

    return rows.rows
  },

  async findTierScreenshots(
    tierId: number
  ): Promise<Array<{ position: number; screenshot: Screenshot }>> {
    const rows = await db('tier_screenshots')
      .join('screenshots', 'tier_screenshots.screenshot_id', 'screenshots.id')
      .where('tier_screenshots.tier_id', tierId)
      .select<
        Array<{
          position: number
          screenshot_id: number
          image_url: string
          thumbnail_url: string | null
          difficulty: number
          location_hint: string | null
          game_id: number
        }>
      >(
        'tier_screenshots.position',
        'screenshots.id as screenshot_id',
        'screenshots.image_url',
        'screenshots.thumbnail_url',
        'screenshots.difficulty',
        'screenshots.location_hint',
        'screenshots.game_id'
      )
      .orderBy('tier_screenshots.position', 'asc')

    return rows.map(row => ({
      position: row.position,
      screenshot: {
        id: row.screenshot_id,
        gameId: row.game_id,
        imageUrl: row.image_url,
        thumbnailUrl: row.thumbnail_url ?? undefined,
        difficulty: row.difficulty as 1 | 2 | 3,
        locationHint: row.location_hint ?? undefined,
      },
    }))
  },

  async findTierScreenshotsWithGames(
    tierId: number,
    positions: number[]
  ): Promise<TierScreenshotWithGame[]> {
    if (positions.length === 0) return []
    const rows = await db('tier_screenshots')
      .join('screenshots', 'tier_screenshots.screenshot_id', 'screenshots.id')
      .join('games', 'screenshots.game_id', 'games.id')
      .where('tier_screenshots.tier_id', tierId)
      .whereIn('tier_screenshots.position', positions)
      .select<
        Array<{
          position: number
          screenshot_id: number
          image_url: string
          thumbnail_url: string | null
          difficulty: number
          location_hint: string | null
          screenshot_game_id: number
          game_id: number
          game_name: string
          game_slug: string
          cover_image_url: string | null
          release_year: number | null
          developer: string | null
          publisher: string | null
          metacritic: number | null
        }>
      >(
        'tier_screenshots.position',
        'screenshots.id as screenshot_id',
        'screenshots.image_url',
        'screenshots.thumbnail_url',
        'screenshots.difficulty',
        'screenshots.location_hint',
        'screenshots.game_id as screenshot_game_id',
        'games.id as game_id',
        'games.name as game_name',
        'games.slug as game_slug',
        'games.cover_image_url',
        'games.release_year',
        'games.developer',
        'games.publisher',
        'games.metacritic'
      )
      .orderBy('tier_screenshots.position', 'asc')

    return rows.map(row => {
      const game: Game = {
        id: row.game_id,
        name: row.game_name,
        slug: row.game_slug,
        aliases: [],
        coverImageUrl: row.cover_image_url ?? undefined,
        releaseYear: row.release_year ?? undefined,
        developer: row.developer ?? undefined,
        publisher: row.publisher ?? undefined,
        metacritic: row.metacritic ?? undefined,
      }
      const screenshot: Screenshot = {
        id: row.screenshot_id,
        gameId: row.screenshot_game_id,
        imageUrl: row.image_url,
        thumbnailUrl: row.thumbnail_url ?? undefined,
        difficulty: row.difficulty as 1 | 2 | 3,
        locationHint: row.location_hint ?? undefined,
      }
      return { position: row.position, screenshot, game }
    })
  },

  async findTierScreenshotsExcludingPositions(
    tierId: number,
    excludePositions: number[]
  ): Promise<TierScreenshotWithGame[]> {
    // Use a sentinel value when the exclusion list is empty so the
    // generated SQL is still valid (`NOT IN (0)` simply excludes
    // nothing, since positions are 1-indexed).
    const exclusions = excludePositions.length > 0 ? excludePositions : [0]
    const rows = await db('tier_screenshots')
      .join('screenshots', 'tier_screenshots.screenshot_id', 'screenshots.id')
      .join('games', 'screenshots.game_id', 'games.id')
      .where('tier_screenshots.tier_id', tierId)
      .whereNotIn('tier_screenshots.position', exclusions)
      .select<
        Array<{
          position: number
          screenshot_id: number
          image_url: string
          thumbnail_url: string | null
          difficulty: number
          location_hint: string | null
          screenshot_game_id: number
          game_id: number
          game_name: string
          game_slug: string
          cover_image_url: string | null
          release_year: number | null
          developer: string | null
          publisher: string | null
          metacritic: number | null
        }>
      >(
        'tier_screenshots.position',
        'screenshots.id as screenshot_id',
        'screenshots.image_url',
        'screenshots.thumbnail_url',
        'screenshots.difficulty',
        'screenshots.location_hint',
        'screenshots.game_id as screenshot_game_id',
        'games.id as game_id',
        'games.name as game_name',
        'games.slug as game_slug',
        'games.cover_image_url',
        'games.release_year',
        'games.developer',
        'games.publisher',
        'games.metacritic'
      )
      .orderBy('tier_screenshots.position', 'asc')

    return rows.map(row => {
      const game: Game = {
        id: row.game_id,
        name: row.game_name,
        slug: row.game_slug,
        aliases: [],
        coverImageUrl: row.cover_image_url ?? undefined,
        releaseYear: row.release_year ?? undefined,
        developer: row.developer ?? undefined,
        publisher: row.publisher ?? undefined,
        metacritic: row.metacritic ?? undefined,
      }
      const screenshot: Screenshot = {
        id: row.screenshot_id,
        gameId: row.screenshot_game_id,
        imageUrl: row.image_url,
        thumbnailUrl: row.thumbnail_url ?? undefined,
        difficulty: row.difficulty as 1 | 2 | 3,
        locationHint: row.location_hint ?? undefined,
      }
      return { position: row.position, screenshot, game }
    })
  },
}

// Type-level check: the repository must satisfy the domain port.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import type { ChallengeRepository as ChallengeRepositoryPort } from '../../domain/ports/repositories.js'
export const _challengeRepositoryTypeCheck: ChallengeRepositoryPort = challengeRepository
