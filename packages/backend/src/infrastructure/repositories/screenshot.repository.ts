import { db } from '../database/connection.js'
import type { Screenshot } from '@the-box/types'

export interface ScreenshotRow {
  id: number
  game_id: number
  image_url: string
  thumbnail_url: string | null
  difficulty: number
  haov: number
  vaov: number
  location_hint: string | null
  created_at: Date
}

export interface ScreenshotWithGame extends ScreenshotRow {
  game_name: string
  game_slug: string
  cover_image_url: string | null
}

function mapRowToScreenshot(row: ScreenshotRow): Screenshot {
  return {
    id: row.id,
    gameId: row.game_id,
    imageUrl: row.image_url,
    thumbnailUrl: row.thumbnail_url ?? undefined,
    difficulty: row.difficulty as 1 | 2 | 3,
    haov: row.haov,
    vaov: row.vaov,
    locationHint: row.location_hint ?? undefined,
  }
}

export const screenshotRepository = {
  async findById(id: number): Promise<Screenshot | null> {
    const row = await db('screenshots').where('id', id).first<ScreenshotRow>()
    return row ? mapRowToScreenshot(row) : null
  },

  async findWithGame(id: number): Promise<{ screenshot: Screenshot; gameName: string; coverImageUrl?: string } | null> {
    const row = await db('screenshots')
      .join('games', 'screenshots.game_id', 'games.id')
      .where('screenshots.id', id)
      .select<ScreenshotWithGame>(
        'screenshots.*',
        'games.name as game_name',
        'games.slug as game_slug',
        'games.cover_image_url'
      )
      .first()

    if (!row) return null

    return {
      screenshot: mapRowToScreenshot(row),
      gameName: row.game_name,
      coverImageUrl: row.cover_image_url ?? undefined,
    }
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
    haov: number
    vaov: number
    locationHint?: string
  }): Promise<Screenshot> {
    const [row] = await db('screenshots')
      .insert({
        game_id: data.gameId,
        image_url: data.imageUrl,
        thumbnail_url: data.thumbnailUrl,
        difficulty: data.difficulty,
        haov: data.haov,
        vaov: data.vaov,
        location_hint: data.locationHint,
      })
      .returning<ScreenshotRow[]>('*')
    return mapRowToScreenshot(row!)
  },
}
