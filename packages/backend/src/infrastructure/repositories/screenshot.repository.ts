import { db } from '../database/connection.js'
import type { Screenshot } from '@the-box/types'

export interface ScreenshotRow {
  id: number
  game_id: number
  image_url: string
  thumbnail_url: string | null
  difficulty: number
  location_hint: string | null
  created_at: Date
}

export interface ScreenshotWithGame extends ScreenshotRow {
  game_name: string
  game_slug: string
  cover_image_url: string | null
  game_aliases: string[] | null
  release_year: number | null
  metacritic: number | null
}

function mapRowToScreenshot(row: ScreenshotRow): Screenshot {
  return {
    id: row.id,
    gameId: row.game_id,
    imageUrl: row.image_url,
    thumbnailUrl: row.thumbnail_url ?? undefined,
    difficulty: row.difficulty as 1 | 2 | 3,
    locationHint: row.location_hint ?? undefined,
  }
}

export const screenshotRepository = {
  async findById(id: number): Promise<Screenshot | null> {
    const row = await db('screenshots').where('id', id).first<ScreenshotRow>()
    return row ? mapRowToScreenshot(row) : null
  },

  async findByGameId(gameId: number): Promise<Screenshot[]> {
    const rows = await db('screenshots')
      .where('game_id', gameId)
      .orderBy('created_at', 'desc')
      .select<ScreenshotRow[]>('*')
    return rows.map(mapRowToScreenshot)
  },

  async findWithGame(id: number): Promise<{ screenshot: Screenshot; gameName: string; coverImageUrl?: string; aliases: string[]; releaseYear?: number; metacritic?: number } | null> {
    const row = await db('screenshots')
      .join('games', 'screenshots.game_id', 'games.id')
      .where('screenshots.id', id)
      .select<ScreenshotWithGame>(
        'screenshots.*',
        'games.name as game_name',
        'games.slug as game_slug',
        'games.cover_image_url',
        'games.aliases as game_aliases',
        'games.release_year',
        'games.metacritic'
      )
      .first()

    if (!row) return null

    return {
      screenshot: mapRowToScreenshot(row),
      gameName: row.game_name,
      coverImageUrl: row.cover_image_url ?? undefined,
      aliases: row.game_aliases ?? [],
      releaseYear: row.release_year ?? undefined,
      metacritic: row.metacritic ?? undefined,
    }
  },

  async getGameByScreenshotId(screenshotId: number): Promise<{ publisher: string | null; developer: string | null } | null> {
    const row = await db('screenshots')
      .join('games', 'screenshots.game_id', 'games.id')
      .where('screenshots.id', screenshotId)
      .select('games.publisher', 'games.developer')
      .first<{ publisher: string | null; developer: string | null }>()

    return row ?? null
  },

  async findAll(): Promise<ScreenshotWithGame[]> {
    return await db('screenshots')
      .join('games', 'screenshots.game_id', 'games.id')
      .orderBy('screenshots.created_at', 'desc')
      .select<ScreenshotWithGame[]>(
        'screenshots.*',
        'games.name as game_name',
        'games.slug as game_slug'
      )
  },

  async create(data: {
    gameId: number
    imageUrl: string
    thumbnailUrl?: string
    difficulty: number
    locationHint?: string
  }): Promise<Screenshot> {
    const [row] = await db('screenshots')
      .insert({
        game_id: data.gameId,
        image_url: data.imageUrl,
        thumbnail_url: data.thumbnailUrl,
        difficulty: data.difficulty,
        location_hint: data.locationHint,
      })
      .returning<ScreenshotRow[]>('*')
    return mapRowToScreenshot(row!)
  },

  async findRandomNotInTier(tierId: number, count: number, minMetacritic?: number): Promise<Screenshot[]> {
    // Get screenshot IDs currently used in the tier
    const usedIds = await db('tier_screenshots')
      .where('tier_id', tierId)
      .pluck<number[]>('screenshot_id')

    // Build query with optional metacritic filter
    let query = db('screenshots')
      .whereNotIn('screenshots.id', usedIds.length > 0 ? usedIds : [0])

    // If minMetacritic is provided, join with games table and filter
    if (minMetacritic !== undefined) {
      query = query
        .join('games', 'screenshots.game_id', 'games.id')
        .where('games.metacritic', '>=', minMetacritic)
        .whereNotNull('games.metacritic')
    }

    // Select random screenshots
    const rows = await query
      .orderByRaw('RANDOM()')
      .limit(count)
      .select<ScreenshotRow[]>('screenshots.*')

    return rows.map(mapRowToScreenshot)
  },
}
