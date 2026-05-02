import { db } from '../database/connection.js'
import { repoLogger } from '../logger/logger.js'
import type {
  GeoSourceName,
  MapPipelineStage,
  MapPipelineState,
} from '@the-box/types'

const log = repoLogger.child({ repository: 'geo-pipeline-state' })

interface Row {
  game_id: number
  current_stage: MapPipelineStage
  active_source: GeoSourceName | null
  next_source_idx: number
  attempts_total: number
  zones_total: number
  zones_covered: number
  zones_selected: number
  needs_curation: boolean
  last_attempt_at: Date | null
  next_eligible_at: Date | null
  updated_at: Date
}

function rowTo(row: Row): MapPipelineState {
  return {
    gameId: row.game_id,
    currentStage: row.current_stage,
    activeSource: row.active_source ?? undefined,
    nextSourceIdx: row.next_source_idx,
    attemptsTotal: row.attempts_total,
    zonesTotal: row.zones_total,
    zonesCovered: row.zones_covered,
    zonesSelected: row.zones_selected,
    needsCuration: row.needs_curation,
    lastAttemptAt: row.last_attempt_at?.toISOString(),
    nextEligibleAt: row.next_eligible_at?.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  }
}

export const geoPipelineStateRepository = {
  async findByGameId(gameId: number): Promise<MapPipelineState | null> {
    const row = await db('geo_game_pipeline_state')
      .where({ game_id: gameId })
      .first<Row>()
    return row ? rowTo(row) : null
  },

  async listActive(limit = 200): Promise<MapPipelineState[]> {
    const rows = await db('geo_game_pipeline_state')
      .whereNot('current_stage', 'ready')
      .orderBy('updated_at', 'desc')
      .limit(limit)
      .select<Row[]>('*')
    return rows.map(rowTo)
  },

  async listByStage(stage: MapPipelineStage, limit = 200): Promise<MapPipelineState[]> {
    const rows = await db('geo_game_pipeline_state')
      .where({ current_stage: stage })
      .orderBy('updated_at', 'desc')
      .limit(limit)
      .select<Row[]>('*')
    return rows.map(rowTo)
  },

  async upsert(input: {
    gameId: number
    currentStage?: MapPipelineStage
    activeSource?: GeoSourceName | null
    nextSourceIdx?: number
    attemptsDelta?: number
    zonesTotal?: number
    zonesCovered?: number
    zonesSelected?: number
    needsCuration?: boolean
    lastAttemptAt?: Date | null
    nextEligibleAt?: Date | null
  }): Promise<MapPipelineState> {
    log.debug({ gameId: input.gameId, stage: input.currentStage }, 'upsert')

    // ON CONFLICT update is the cleanest way to keep this idempotent.
    const result = await db.raw<{ rows: Row[] }>(
      `
      INSERT INTO geo_game_pipeline_state (
        game_id, current_stage, active_source, next_source_idx,
        attempts_total, zones_total, zones_covered, zones_selected,
        needs_curation, last_attempt_at, next_eligible_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
      ON CONFLICT (game_id) DO UPDATE SET
        current_stage = COALESCE(EXCLUDED.current_stage, geo_game_pipeline_state.current_stage),
        active_source = EXCLUDED.active_source,
        next_source_idx = COALESCE(EXCLUDED.next_source_idx, geo_game_pipeline_state.next_source_idx),
        attempts_total = geo_game_pipeline_state.attempts_total + ?,
        zones_total = COALESCE(EXCLUDED.zones_total, geo_game_pipeline_state.zones_total),
        zones_covered = COALESCE(EXCLUDED.zones_covered, geo_game_pipeline_state.zones_covered),
        zones_selected = COALESCE(EXCLUDED.zones_selected, geo_game_pipeline_state.zones_selected),
        needs_curation = COALESCE(EXCLUDED.needs_curation, geo_game_pipeline_state.needs_curation),
        last_attempt_at = COALESCE(EXCLUDED.last_attempt_at, geo_game_pipeline_state.last_attempt_at),
        next_eligible_at = EXCLUDED.next_eligible_at,
        updated_at = NOW()
      RETURNING *
      `,
      [
        input.gameId,
        input.currentStage ?? 'queued',
        input.activeSource ?? null,
        input.nextSourceIdx ?? 0,
        input.attemptsDelta ?? 0,
        input.zonesTotal ?? 0,
        input.zonesCovered ?? 0,
        input.zonesSelected ?? 0,
        input.needsCuration ?? false,
        input.lastAttemptAt ?? null,
        input.nextEligibleAt ?? null,
        input.attemptsDelta ?? 0,
      ],
    )
    const row = result.rows[0]!
    return rowTo(row)
  },

  // Recompute zone counts from geo_map. Called after the pipeline writes maps
  // or after admin curation flips selection. Single-zone games (NULL
  // zone_slug) are counted as one zone if any map exists.
  async recomputeZoneCounts(gameId: number): Promise<void> {
    log.debug({ gameId }, 'recomputeZoneCounts')
    await db.raw(
      `
      UPDATE geo_game_pipeline_state
      SET
        zones_total = COALESCE((
          SELECT COUNT(DISTINCT COALESCE(zone_slug, ''))
          FROM geo_map
          WHERE game_id = ? AND is_active = true
        ), 0),
        zones_covered = COALESCE((
          SELECT COUNT(DISTINCT COALESCE(zone_slug, ''))
          FROM geo_map
          WHERE game_id = ?
        ), 0),
        zones_selected = COALESCE((
          SELECT COUNT(*)
          FROM geo_map
          WHERE game_id = ? AND is_selected = true
        ), 0),
        updated_at = NOW()
      WHERE game_id = ?
      `,
      [gameId, gameId, gameId, gameId],
    )
  },
}
