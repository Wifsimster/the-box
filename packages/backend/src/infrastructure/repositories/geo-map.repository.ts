import { db } from '../database/connection.js'
import { repoLogger } from '../logger/logger.js'
import type { GeoMap, GeoMapSource } from '@the-box/types'

const log = repoLogger.child({ repository: 'geo-map' })

export interface GeoMapRow {
  id: number
  game_id: number
  source: GeoMapSource
  source_url: string | null
  image_url: string
  width_px: number
  height_px: number
  consensus_radius: number
  license: string
  attribution: string | null
  region: string | null
  wiki_map_name: string | null
  wiki_revision_id: string | number | null
  is_active: boolean
  created_at: Date
}

function mapRow(row: GeoMapRow): GeoMap {
  // pg returns BIGINT as string; coerce to number when present.
  const revision =
    row.wiki_revision_id == null
      ? undefined
      : typeof row.wiki_revision_id === 'string'
        ? Number(row.wiki_revision_id)
        : row.wiki_revision_id
  return {
    id: row.id,
    gameId: row.game_id,
    source: row.source,
    sourceUrl: row.source_url ?? undefined,
    imageUrl: row.image_url,
    widthPx: row.width_px,
    heightPx: row.height_px,
    consensusRadius: row.consensus_radius,
    license: row.license,
    attribution: row.attribution ?? undefined,
    region: row.region ?? undefined,
    wikiMapName: row.wiki_map_name ?? undefined,
    wikiRevisionId: revision,
  }
}

export const geoMapRepository = {
  async findById(id: number): Promise<GeoMap | null> {
    const row = await db('geo_map').where({ id, is_active: true }).first<GeoMapRow>()
    return row ? mapRow(row) : null
  },

  async findActiveByGameId(gameId: number): Promise<GeoMap | null> {
    const row = await db('geo_map')
      .where({ game_id: gameId, is_active: true })
      .orderBy('created_at', 'desc')
      .first<GeoMapRow>()
    return row ? mapRow(row) : null
  },

  async findBySourceAndGameId(
    gameId: number,
    source: GeoMapSource,
  ): Promise<GeoMap | null> {
    const row = await db('geo_map')
      .where({ game_id: gameId, source })
      .orderBy('created_at', 'desc')
      .first<GeoMapRow>()
    return row ? mapRow(row) : null
  },

  async listByGameId(
    gameId: number,
  ): Promise<Array<GeoMap & { isActive: boolean }>> {
    const rows = await db('geo_map')
      .where({ game_id: gameId })
      .orderBy('created_at', 'desc')
      .select<GeoMapRow[]>('*')
    return rows.map((r) => ({ ...mapRow(r), isActive: r.is_active }))
  },

  async create(data: {
    gameId: number
    source: GeoMapSource
    sourceUrl?: string
    imageUrl: string
    widthPx: number
    heightPx: number
    consensusRadius?: number
    license: string
    attribution?: string
    region?: string | null
    wikiMapName?: string | null
    wikiRevisionId?: number | null
    // When omitted, the row is active only if no other active row exists for
    // this game (transactional — multi-tier ingestion stores all results but
    // only the first tier to land becomes the default; admins can swap later).
    isActive?: boolean
  }): Promise<GeoMap> {
    log.info({ gameId: data.gameId, source: data.source }, 'create')
    const row = await db.transaction(async (trx) => {
      let isActive: boolean
      if (data.isActive === undefined) {
        const existingActive = await trx('geo_map')
          .where({ game_id: data.gameId, is_active: true })
          .first<{ id: number }>('id')
        isActive = !existingActive
      } else {
        isActive = data.isActive
      }
      const [inserted] = await trx('geo_map')
        .insert({
          game_id: data.gameId,
          source: data.source,
          source_url: data.sourceUrl ?? null,
          image_url: data.imageUrl,
          width_px: data.widthPx,
          height_px: data.heightPx,
          consensus_radius: data.consensusRadius ?? 0.03,
          license: data.license,
          attribution: data.attribution ?? null,
          region: data.region ?? null,
          wiki_map_name: data.wikiMapName ?? null,
          wiki_revision_id: data.wikiRevisionId ?? null,
          is_active: isActive,
        })
        .returning<GeoMapRow[]>('*')
      return inserted!
    })
    return mapRow(row)
  },

  async deactivate(id: number): Promise<void> {
    log.info({ id }, 'deactivate')
    await db('geo_map').where({ id }).update({ is_active: false })
  },

  // Atomically promote `mapId` to the active map for `gameId` and deactivate
  // any siblings. Used by the admin "select this map" flow.
  async setActiveForGame(gameId: number, mapId: number): Promise<GeoMap | null> {
    log.info({ gameId, mapId }, 'setActiveForGame')
    return await db.transaction(async (trx) => {
      const target = await trx('geo_map')
        .where({ id: mapId, game_id: gameId })
        .first<GeoMapRow>()
      if (!target) return null
      await trx('geo_map')
        .where({ game_id: gameId })
        .whereNot({ id: mapId })
        .update({ is_active: false })
      const [updated] = await trx('geo_map')
        .where({ id: mapId })
        .update({ is_active: true })
        .returning<GeoMapRow[]>('*')
      return updated ? mapRow(updated) : null
    })
  },
}
