import { db } from '../database/connection.js'
import type { Game, GameSearchResult } from '@the-box/types'
import { repoLogger } from '../logger/logger.js'

const log = repoLogger.child({ repository: 'game' })

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
    log.debug({ gameId: id }, 'findById')
    const row = await db('games').where('id', id).first<GameRow>()
    log.debug({ gameId: id, found: !!row }, 'findById result')
    return row ? mapRowToGame(row) : null
  },

  async findAll(): Promise<Game[]> {
    log.debug('findAll')
    const rows = await db('games').orderBy('created_at', 'desc').select<GameRow[]>('*')
    log.debug({ count: rows.length }, 'findAll result')
    return rows.map(mapRowToGame)
  },

  async search(query: string, limit = 10): Promise<GameSearchResult[]> {
    log.debug({ query, limit }, 'search')
    const rows = await db('games')
      .whereILike('name', `%${query}%`)
      .orderBy('name', 'desc')
      .limit(limit)
      .select<GameRow[]>('*')

    log.debug({ query, resultCount: rows.length }, 'search result')
    return rows.map(row => ({
      id: row.id,
      name: row.name,
      releaseYear: row.release_year ?? undefined,
      coverImageUrl: row.cover_image_url ?? undefined,
    }))
  },

  async create(data: Partial<Game>): Promise<Game> {
    log.info({ name: data.name, slug: data.slug }, 'create game')
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
    log.info({ gameId: row!.id, name: row!.name }, 'game created')
    return mapRowToGame(row!)
  },

  async update(id: number, data: Partial<Game>): Promise<Game | null> {
    log.info({ gameId: id, fields: Object.keys(data) }, 'update game')
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
    log.info({ gameId: id, updated: !!row }, 'game update result')
    return row ? mapRowToGame(row) : null
  },

  async delete(id: number): Promise<void> {
    log.warn({ gameId: id }, 'delete game')
    await db('games').where('id', id).del()
    log.info({ gameId: id }, 'game deleted')
  },
}
