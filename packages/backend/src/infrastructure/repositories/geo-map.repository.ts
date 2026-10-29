import { db } from '../database/connection.js'
import { repoLogger } from '../logger/logger.js'
import type {
  GeoMap,
  GeoMapKind,
  GeoMapSource,
  GeoMapTilesConfig,
  GeoTileScheme,
} from '@the-box/types'

const log = repoLogger.child({ repository: 'geo-map' })

export interface GeoMapRow {
  id: number
  game_id: number
  source: GeoMapSource
  source_url: string | null
  image_url: string
  width_px: number
  height_px: number
  kind: GeoMapKind
  tile_url_template: string | null
  tile_min_zoom: number | null
  tile_max_zoom: number | null
  tile_size: number | null
  tile_scheme: GeoTileScheme | null
  consensus_radius: number
  license: string
  attribution: string | null
  region: string | null
  wiki_map_name: string | null
  wiki_revision_id: string | number | null
  zone_name: string | null
  zone_slug: string | null
  provider: string | null
  is_active: boolean
  is_selected: boolean
  selected_by: string | null
  selected_at: Date | null
  content_sha256: string | null
  created_at: Date
}

function mapRow(row: GeoMapRow): GeoMap {
  const revision =
    row.wiki_revision_id == null
      ? undefined
      : typeof row.wiki_revision_id === 'string'
        ? Number(row.wiki_revision_id)
        : row.wiki_revision_id
  const tiles: GeoMapTilesConfig | undefined =
    row.kind === 'tiles' &&
    row.tile_url_template &&
    row.tile_min_zoom != null &&
    row.tile_max_zoom != null &&
    row.tile_size != null &&
    row.tile_scheme
      ? {
          urlTemplate: row.tile_url_template,
          minZoom: row.tile_min_zoom,
          maxZoom: row.tile_max_zoom,
          tileSize: row.tile_size,
          scheme: row.tile_scheme,
        }
      : undefined
  return {
    id: row.id,
    gameId: row.game_id,
    source: row.source,
    sourceUrl: row.source_url ?? undefined,
    imageUrl: row.image_url,
    widthPx: row.width_px,
    heightPx: row.height_px,
    kind: tiles ? 'tiles' : 'image',
    tiles,
    consensusRadius: row.consensus_radius,
    license: row.license,
    attribution: row.attribution ?? undefined,
    region: row.region ?? undefined,
    wikiMapName: row.wiki_map_name ?? undefined,
    wikiRevisionId: revision,
    zoneName: row.zone_name ?? undefined,
    zoneSlug: row.zone_slug ?? undefined,
    provider: row.provider ?? undefined,
    isSelected: row.is_selected,
    isCaptureDefault: row.is_selected,
  }
}

export type DisableResult =
  | { ok: true; map: GeoMap }
  | { ok: false; reason: 'NOT_FOUND' | 'LAST_ENABLED' }

export const geoMapRepository = {
  async findById(id: number): Promise<GeoMap | null> {
    const row = await db('geo_map').where({ id }).first<GeoMapRow>()
    return row ? mapRow(row) : null
  },

  async findFirstEnabledByGameId(gameId: number): Promise<GeoMap | null> {
    const row = await db('geo_map')
      .where({ game_id: gameId, is_active: true })
      .orderBy('created_at', 'desc')
      .first<GeoMapRow>()
    return row ? mapRow(row) : null
  },

  async findActiveByGameId(gameId: number): Promise<GeoMap | null> {
    return this.findFirstEnabledByGameId(gameId)
  },

  async findCaptureDefaultByGameId(gameId: number): Promise<GeoMap | null> {
    const row = await db('geo_map')
      .where({ game_id: gameId, is_selected: true })
      .whereNull('zone_slug')
      .first<GeoMapRow>()
    return row ? mapRow(row) : null
  },

  async findSelectedByZone(
    gameId: number,
    zoneSlug: string | null,
  ): Promise<GeoMap | null> {
    const q = db('geo_map').where({ game_id: gameId, is_selected: true })
    const row = await (zoneSlug == null
      ? q.whereNull('zone_slug').first<GeoMapRow>()
      : q.where({ zone_slug: zoneSlug }).first<GeoMapRow>())
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

  async findBySourceUrl(gameId: number, sourceUrl: string): Promise<GeoMap | null> {
    const row = await db('geo_map')
      .where({ game_id: gameId, source_url: sourceUrl })
      .first<GeoMapRow>()
    return row ? mapRow(row) : null
  },

  async findByContentHash(
    gameId: number,
    contentSha256: string,
  ): Promise<GeoMap | null> {
    const row = await db('geo_map')
      .where({ game_id: gameId, content_sha256: contentSha256 })
      .first<GeoMapRow>()
    return row ? mapRow(row) : null
  },

  async deleteById(id: number): Promise<boolean> {
    log.info({ id }, 'deleteById')
    const count = await db('geo_map').where({ id }).delete()
    return count > 0
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

  async listCandidatesByGameId(
    gameId: number,
  ): Promise<Array<GeoMap & { isActive: boolean }>> {
    const rows = await db('geo_map')
      .where({ game_id: gameId })
      .orderBy(['zone_slug', 'created_at'])
      .select<GeoMapRow[]>('*')
    return rows.map((r) => ({ ...mapRow(r), isActive: r.is_active }))
  },

  async listEnabledByGameId(gameId: number): Promise<GeoMap[]> {
    const rows = await db('geo_map')
      .where({ game_id: gameId, is_active: true })
      .orderBy('created_at', 'asc')
      .select<GeoMapRow[]>('*')
    return rows.map(mapRow)
  },

  async findEnabledById(gameId: number, mapId: number): Promise<GeoMap | null> {
    const row = await db('geo_map')
      .where({ id: mapId, game_id: gameId, is_active: true })
      .first<GeoMapRow>()
    return row ? mapRow(row) : null
  },

  async create(data: {
    gameId: number
    source: GeoMapSource
    sourceUrl?: string
    imageUrl: string
    widthPx: number
    heightPx: number
    tiles?: GeoMapTilesConfig
    consensusRadius?: number
    license: string
    attribution?: string
    region?: string | null
    wikiMapName?: string | null
    wikiRevisionId?: number | null
    zoneName?: string | null
    zoneSlug?: string | null
    provider?: string | null
    contentSha256?: string | null
    isActive?: boolean
  }): Promise<GeoMap> {
    log.info(
      { gameId: data.gameId, source: data.source, zoneSlug: data.zoneSlug ?? null },
      'create',
    )
    const row = await db.transaction(async (trx) => {
      const isActive = data.isActive ?? false
      const lockQuery = trx('geo_map').where({ game_id: data.gameId }).forUpdate()
      await (data.zoneSlug == null
        ? lockQuery.whereNull('zone_slug')
        : lockQuery.where({ zone_slug: data.zoneSlug })
      ).select('id')
      const selectedQuery = trx('geo_map').where({
        game_id: data.gameId,
        is_selected: true,
      })
      const existingSelected = await (data.zoneSlug == null
        ? selectedQuery.whereNull('zone_slug')
        : selectedQuery.where({ zone_slug: data.zoneSlug })
      ).first<{ id: number }>('id')
      const isSelected = isActive && !existingSelected
      const [inserted] = await trx('geo_map')
        .insert({
          game_id: data.gameId,
          source: data.source,
          source_url: data.sourceUrl ?? null,
          image_url: data.imageUrl,
          width_px: data.widthPx,
          height_px: data.heightPx,
          kind: data.tiles ? 'tiles' : 'image',
          tile_url_template: data.tiles?.urlTemplate ?? null,
          tile_min_zoom: data.tiles?.minZoom ?? null,
          tile_max_zoom: data.tiles?.maxZoom ?? null,
          tile_size: data.tiles?.tileSize ?? null,
          tile_scheme: data.tiles?.scheme ?? null,
          consensus_radius: data.consensusRadius ?? 0.03,
          license: data.license,
          attribution: data.attribution ?? null,
          region: data.region ?? null,
          wiki_map_name: data.wikiMapName ?? null,
          wiki_revision_id: data.wikiRevisionId ?? null,
          zone_name: data.zoneName ?? null,
          zone_slug: data.zoneSlug ?? null,
          provider: data.provider ?? data.source,
          content_sha256: data.contentSha256 ?? null,
          is_active: isActive,
          is_selected: isSelected,
          selected_at: isSelected ? new Date() : null,
        })
        .returning<GeoMapRow[]>('*')
      return inserted!
    })
    return mapRow(row)
  },

  async deactivate(id: number): Promise<void> {
    log.info({ id }, 'deactivate')
    await db('geo_map').where({ id }).update({ is_active: false, is_selected: false })
  },

  async enableForGame(gameId: number, mapId: number): Promise<GeoMap | null> {
    log.info({ gameId, mapId }, 'enableForGame')
    return await db.transaction(async (trx) => {
      const target = await trx('geo_map')
        .where({ id: mapId, game_id: gameId })
        .first<GeoMapRow>()
      if (!target) return null
      const selectedQuery = trx('geo_map')
        .where({ game_id: gameId, is_selected: true })
        .whereNot({ id: mapId })
      const otherSelected = await (target.zone_slug == null
        ? selectedQuery.whereNull('zone_slug')
        : selectedQuery.where({ zone_slug: target.zone_slug })
      ).first<{ id: number }>('id')
      const [updated] = await trx('geo_map')
        .where({ id: mapId })
        .update({
          is_active: true,
          ...(otherSelected
            ? {}
            : { is_selected: true, selected_at: new Date() }),
        })
        .returning<GeoMapRow[]>('*')
      return updated ? mapRow(updated) : null
    })
  },

  async disableForGame(gameId: number, mapId: number): Promise<DisableResult> {
    log.info({ gameId, mapId }, 'disableForGame')
    return await db.transaction(async (trx) => {
      const locked = await trx('geo_map')
        .where({ game_id: gameId })
        .forUpdate()
        .select<GeoMapRow[]>('*')
      const target = locked.find((r) => r.id === mapId)
      if (!target) return { ok: false as const, reason: 'NOT_FOUND' as const }

      const remainingEnabled = locked.filter((r) => r.is_active && r.id !== mapId).length
      if (remainingEnabled === 0) {
        return { ok: false as const, reason: 'LAST_ENABLED' as const }
      }

      const [updated] = await trx('geo_map')
        .where({ id: mapId })
        .update({ is_active: false, is_selected: false })
        .returning<GeoMapRow[]>('*')

      if (target.is_selected) {
        const heir = locked
          .filter(
            (r) =>
              r.is_active &&
              r.id !== mapId &&
              (target.zone_slug == null
                ? r.zone_slug == null
                : r.zone_slug === target.zone_slug),
          )
          .sort((a, b) => b.created_at.getTime() - a.created_at.getTime())[0]
        if (heir) {
          await trx('geo_map')
            .where({ id: heir.id })
            .update({ is_selected: true, selected_at: new Date() })
        }
      }

      return updated
        ? { ok: true as const, map: mapRow(updated) }
        : { ok: false as const, reason: 'NOT_FOUND' as const }
    })
  },

  async selectMap(
    gameId: number,
    mapId: number,
    selectedBy: string | null = null,
  ): Promise<GeoMap | null> {
    log.info({ gameId, mapId, selectedBy }, 'selectMap')
    return await db.transaction(async (trx) => {
      const target = await trx('geo_map')
        .where({ id: mapId, game_id: gameId, is_active: true })
        .first<GeoMapRow>()
      if (!target) return null
      const lockQuery = trx('geo_map').where({ game_id: gameId }).forUpdate()
      await (target.zone_slug == null
        ? lockQuery.whereNull('zone_slug')
        : lockQuery.where({ zone_slug: target.zone_slug })
      ).select('id')

      const clearQuery = trx('geo_map').where({
        game_id: gameId,
        is_selected: true,
      })
      await (target.zone_slug == null
        ? clearQuery.whereNull('zone_slug')
        : clearQuery.where({ zone_slug: target.zone_slug })
      ).update({ is_selected: false })
      const [updated] = await trx('geo_map')
        .where({ id: mapId })
        .update({
          is_selected: true,
          selected_by: selectedBy,
          selected_at: new Date(),
        })
        .returning<GeoMapRow[]>('*')
      return updated ? mapRow(updated) : null
    })
  },

  async setCaptureDefault(gameId: number, mapId: number): Promise<GeoMap | null> {
    return this.selectMap(gameId, mapId, null)
  },

  async updateRegion(mapId: number, region: string | null): Promise<GeoMap | null> {
    log.info({ mapId, region }, 'updateRegion')
    const trimmed = region == null ? null : region.trim() || null
    const [updated] = await db('geo_map')
      .where({ id: mapId })
      .update({ region: trimmed })
      .returning<GeoMapRow[]>('*')
    return updated ? mapRow(updated) : null
  },

  async setActiveForGame(gameId: number, mapId: number): Promise<GeoMap | null> {
    return this.enableForGame(gameId, mapId)
  },
}
