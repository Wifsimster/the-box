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
  is_capture_default: boolean
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
    isCaptureDefault: row.is_capture_default,
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
  // (`pickContributionTarget`, ingest tick when no capture default is set).
  // Multi-map callers should prefer `listEnabledByGameId`.
  async findFirstEnabledByGameId(gameId: number): Promise<GeoMap | null> {
    const row = await db('geo_map')
      .where({ game_id: gameId, is_active: true })
      .orderBy('created_at', 'desc')
      .first<GeoMapRow>()
    return row ? mapRow(row) : null
  },

  // Back-compat alias — old call sites still reference this name.
  async findActiveByGameId(gameId: number): Promise<GeoMap | null> {
    return this.findFirstEnabledByGameId(gameId)
  },

  async findCaptureDefaultByGameId(gameId: number): Promise<GeoMap | null> {
    const row = await db('geo_map')
      .where({ game_id: gameId, is_capture_default: true })
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
    // When omitted, defaults to false. Multi-map mode no longer auto-flips
    // the first-to-land row to active — admins explicitly enable maps from
    // the Cartes side panel. Pass `isActive: true` to short-circuit (used
    // by manual upload + the seed).
    isActive?: boolean
  }): Promise<GeoMap> {
    log.info({ gameId: data.gameId, source: data.source }, 'create')
    const row = await db.transaction(async (trx) => {
      const isActive = data.isActive ?? false
      // Promote to capture-default only if the game has none yet — keeps
      // the very first map a game ever gets pointing capture providers
      // somewhere sensible without overriding explicit admin choices.
      const existingCaptureDefault = await trx('geo_map')
        .where({ game_id: data.gameId, is_capture_default: true })
        .first<{ id: number }>('id')
      const isCaptureDefault = isActive && !existingCaptureDefault
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
          is_capture_default: isCaptureDefault,
        })
        .returning<GeoMapRow[]>('*')
      return inserted!
    })
    return mapRow(row)
  },

  async deactivate(id: number): Promise<void> {
    log.info({ id }, 'deactivate')
    await db('geo_map').where({ id }).update({ is_active: false, is_capture_default: false })
  },

  // Multi-map enable: flip just this row to enabled. If the game had no
  // enabled maps before this call, also promote it to capture-default so
  // ingest has a target.
  async enableForGame(gameId: number, mapId: number): Promise<GeoMap | null> {
    log.info({ gameId, mapId }, 'enableForGame')
    return await db.transaction(async (trx) => {
      const target = await trx('geo_map')
        .where({ id: mapId, game_id: gameId })
        .first<GeoMapRow>()
      if (!target) return null
      const otherEnabled = await trx('geo_map')
        .where({ game_id: gameId, is_active: true })
        .whereNot({ id: mapId })
        .first<{ id: number }>('id')
      const [updated] = await trx('geo_map')
        .where({ id: mapId })
        .update({
          is_active: true,
          // Only promote to capture-default if there isn't another
          // enabled sibling that already holds the role.
          ...(otherEnabled ? {} : { is_capture_default: true }),
        })
        .returning<GeoMapRow[]>('*')
      return updated ? mapRow(updated) : null
    })
  },

  // Multi-map disable: flip a single row off. Refuses if it would leave
  // the game with zero enabled maps. If we disable the current capture
  // default and a sibling exists, the sibling is promoted (most-recently
  // enabled wins).
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
        .update({ is_active: false, is_capture_default: false })
        .returning<GeoMapRow[]>('*')

      // If the disabled row was the capture default, hand the role to the
      // most-recently-created enabled sibling. The partial unique index
      // `geo_map_one_capture_default_per_game` ensures we never end up
      // with two defaults.
      if (target.is_capture_default) {
        const heir = await trx('geo_map')
          .where({ game_id: gameId, is_active: true })
          .orderBy('created_at', 'desc')
          .first<GeoMapRow>()
        if (heir) {
          await trx('geo_map')
            .where({ id: heir.id })
            .update({ is_capture_default: true })
        }
      }

      return updated
        ? { ok: true as const, map: mapRow(updated) }
        : { ok: false as const, reason: 'NOT_FOUND' as const }
    })
  },

  // Atomically pick the new capture-default for a game. The partial unique
  // index keeps us honest: clear all rows for the game first, then set
  // the target.
  async setCaptureDefault(gameId: number, mapId: number): Promise<GeoMap | null> {
    log.info({ gameId, mapId }, 'setCaptureDefault')
    return await db.transaction(async (trx) => {
      const target = await trx('geo_map')
        .where({ id: mapId, game_id: gameId, is_active: true })
        .first<GeoMapRow>()
      if (!target) return null
      await trx('geo_map')
        .where({ game_id: gameId })
        .update({ is_capture_default: false })
      const [updated] = await trx('geo_map')
        .where({ id: mapId })
        .update({ is_capture_default: true })
        .returning<GeoMapRow[]>('*')
      return updated ? mapRow(updated) : null
    })
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
