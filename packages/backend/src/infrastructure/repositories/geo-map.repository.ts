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
    zoneName: row.zone_name ?? undefined,
    zoneSlug: row.zone_slug ?? undefined,
    provider: row.provider ?? undefined,
    isSelected: row.is_selected,
    // Mirror for one release while old call sites migrate off the alias.
    isCaptureDefault: row.is_selected,
  }
}

export type DisableResult =
  | { ok: true; map: GeoMap }
  | { ok: false; reason: 'NOT_FOUND' | 'LAST_ENABLED' }

export const geoMapRepository = {
  async findById(id: number): Promise<GeoMap | null> {
    // No `is_active` filter: callers (challenge hydrate, candidate detail)
    // need the map even if an admin temporarily disabled it after a meta
    // was promoted. A separate filter on enabled maps is provided by
    // `listEnabledByGameId` for the chooser.
    const row = await db('geo_map').where({ id }).first<GeoMapRow>()
    return row ? mapRow(row) : null
  },

  // First enabled map for a game. Kept for legacy single-map callers
  // (`pickContributionTarget`, ingest tick when no selection is set).
  // Multi-map callers should prefer `listEnabledByGameId`.
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
    // Capture-default is now the selected single-zone (NULL zone_slug) map.
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

  // Per-page dedupe for sources that produce multiple rows per game
  // (Fextralife discovers per-region map pages — Nautiloid / Wilderness /
  // Shadow-Cursed Lands / Baldur's Gate for BG3 — and we want each page to
  // land exactly once even if the importer re-runs).
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

  // Delete a single row by id. Used by the Fextralife importer to prune a
  // pre-existing generic-index map after per-region pages are discovered
  // (the index's og:image is a wiki banner, not a usable region map).
  // Returns whether a row was deleted.
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

  // All candidates fetched by any provider, regardless of active/selected
  // state. Powers the admin curation drawer (group by zone, side-by-side).
  async listCandidatesByGameId(
    gameId: number,
  ): Promise<Array<GeoMap & { isActive: boolean }>> {
    const rows = await db('geo_map')
      .where({ game_id: gameId })
      .orderBy(['zone_slug', 'created_at'])
      .select<GeoMapRow[]>('*')
    return rows.map((r) => ({ ...mapRow(r), isActive: r.is_active }))
  },

  // Enabled = playable: the chooser surfaces these for a daily challenge,
  // and the schedule picker only draws candidates whose map is enabled.
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
    // When omitted, defaults to false. Multi-map mode no longer auto-flips
    // the first-to-land row to active — admins explicitly enable maps from
    // the Cartes side panel. Pass `isActive: true` to short-circuit (used
    // by manual upload + the seed).
    isActive?: boolean
  }): Promise<GeoMap> {
    log.info(
      { gameId: data.gameId, source: data.source, zoneSlug: data.zoneSlug ?? null },
      'create',
    )
    const row = await db.transaction(async (trx) => {
      const isActive = data.isActive ?? false
      // Promote to selected only if no map is selected for the same zone
      // yet — keeps the very first map a game ever gets pointing at
      // something sensible without overriding explicit admin choices.
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

  // Multi-map enable: flip just this row to enabled. If no map is selected
  // for the same zone, also promote it to selected so the pipeline has a
  // target.
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

  // Multi-map disable: flip a single row off. Refuses if it would leave
  // the game with zero enabled maps. If we disable the currently selected
  // row in a zone and a sibling exists, the sibling is promoted (most-
  // recently enabled wins).
  async disableForGame(gameId: number, mapId: number): Promise<DisableResult> {
    log.info({ gameId, mapId }, 'disableForGame')
    return await db.transaction(async (trx) => {
      const target = await trx('geo_map')
        .where({ id: mapId, game_id: gameId })
        .first<GeoMapRow>()
      if (!target) return { ok: false as const, reason: 'NOT_FOUND' as const }

      const remainingEnabled = await trx('geo_map')
        .where({ game_id: gameId, is_active: true })
        .whereNot({ id: mapId })
        .count<{ count: string }[]>({ count: '*' })
        .first()
      if (Number(remainingEnabled?.count ?? 0) === 0) {
        return { ok: false as const, reason: 'LAST_ENABLED' as const }
      }

      const [updated] = await trx('geo_map')
        .where({ id: mapId })
        .update({ is_active: false, is_selected: false })
        .returning<GeoMapRow[]>('*')

      // If the disabled row was the selected one for its zone, promote the
      // most-recently-created enabled sibling in the same zone.
      if (target.is_selected) {
        const heirQuery = trx('geo_map')
          .where({ game_id: gameId, is_active: true })
          .orderBy('created_at', 'desc')
        const heir = await (target.zone_slug == null
          ? heirQuery.whereNull('zone_slug')
          : heirQuery.where({ zone_slug: target.zone_slug })
        ).first<GeoMapRow>()
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

  // Atomically pick the selected map for a (game, zone). Other rows in the
  // same zone get is_selected=false. The partial unique index keeps us
  // honest: at most one selected row per (game, zone_slug).
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

  // Back-compat alias used by single-zone admin endpoints.
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

  // Deprecated alias for `enableForGame` — kept so any cached frontend
  // calling the old `/active-map` endpoint keeps working through one
  // release. New code should call `enableForGame`.
  async setActiveForGame(gameId: number, mapId: number): Promise<GeoMap | null> {
    return this.enableForGame(gameId, mapId)
  },
}
