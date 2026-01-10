import { db } from '../database/connection.js'
import type { Game, GameSearchResult } from '@the-box/types'

export interface GameRow {
  id: number
  name: string
  slug: string
  aliases: string[] | null
  release_year: number | null
  developer: string | null
  publisher: string | null
  genres: string[] | null
  platforms: string[] | null
  cover_image_url: string | null
  created_at: Date
}

function mapRowToGame(row: GameRow): Game {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    aliases: row.aliases ?? [],
    releaseYear: row.release_year ?? undefined,
    developer: row.developer ?? undefined,
    publisher: row.publisher ?? undefined,
    genres: row.genres ?? undefined,
    platforms: row.platforms ?? undefined,
    coverImageUrl: row.cover_image_url ?? undefined,
  }
}

export const gameRepository = {
  async findById(id: number): Promise<Game | null> {
    const row = await db('games').where('id', id).first<GameRow>()
    return row ? mapRowToGame(row) : null
  },

  async findAll(): Promise<Game[]> {
    const rows = await db('games').orderBy('created_at', 'desc').select<GameRow[]>('*')
    return rows.map(mapRowToGame)
  },

  async search(query: string, limit = 10): Promise<GameSearchResult[]> {
    const rows = await db('games')
      .whereILike('name', `%${query}%`)
      .orderBy('name', 'desc')
      .limit(limit)
      .select<GameRow[]>('*')

    return rows.map(row => ({
      id: row.id,
      name: row.name,
      releaseYear: row.release_year ?? undefined,
      coverImageUrl: row.cover_image_url ?? undefined,
    }))
  },

  async create(data: Partial<Game>): Promise<Game> {
    const [row] = await db('games')
      .insert({
        name: data.name,
        slug: data.slug,
        aliases: data.aliases,
        release_year: data.releaseYear,
        developer: data.developer,
        publisher: data.publisher,
        genres: data.genres,
        platforms: data.platforms,
        cover_image_url: data.coverImageUrl,
      })
      .returning<GameRow[]>('*')
    return mapRowToGame(row!)
  },

  async update(id: number, data: Partial<Game>): Promise<Game | null> {
    const updateData: Record<string, unknown> = {}
    if (data.name) updateData['name'] = data.name
    if (data.slug) updateData['slug'] = data.slug
    if (data.aliases) updateData['aliases'] = data.aliases
    if (data.releaseYear) updateData['release_year'] = data.releaseYear
    if (data.developer) updateData['developer'] = data.developer
    if (data.publisher) updateData['publisher'] = data.publisher
    if (data.genres) updateData['genres'] = data.genres
    if (data.platforms) updateData['platforms'] = data.platforms
    if (data.coverImageUrl) updateData['cover_image_url'] = data.coverImageUrl

    const [row] = await db('games')
      .where('id', id)
      .update(updateData)
      .returning<GameRow[]>('*')
    return row ? mapRowToGame(row) : null
  },

  async delete(id: number): Promise<void> {
    await db('games').where('id', id).del()
  },
}
