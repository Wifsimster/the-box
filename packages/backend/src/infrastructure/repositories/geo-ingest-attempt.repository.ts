import { db } from '../database/connection.js'
import { repoLogger } from '../logger/logger.js'
import type {
  GeoIngestAttempt,
  GeoIngestAttemptKind,
  GeoIngestOutcome,
  GeoSourceName,
} from '@the-box/types'

const log = repoLogger.child({ repository: 'geo-ingest-attempt' })

interface Row {
  id: string | number
  game_id: number
  source: GeoSourceName
  attempt_kind: GeoIngestAttemptKind
  outcome: GeoIngestOutcome
  http_status: number | null
  error_code: string | null
  error_detail: Record<string, unknown> | null
  items_ingested: number
  latency_ms: number | null
  correlation_id: string | null
  attempted_at: Date
}

function rowTo(row: Row): GeoIngestAttempt {
  return {
    id: typeof row.id === 'string' ? Number(row.id) : row.id,
    gameId: row.game_id,
    source: row.source,
    attemptKind: row.attempt_kind,
    outcome: row.outcome,
    httpStatus: row.http_status ?? undefined,
    errorCode: row.error_code ?? undefined,
    errorDetail: row.error_detail ?? undefined,
    itemsIngested: row.items_ingested,
    latencyMs: row.latency_ms ?? undefined,
    correlationId: row.correlation_id ?? undefined,
    attemptedAt: row.attempted_at.toISOString(),
  }
}

export const geoIngestAttemptRepository = {
  async record(input: {
    gameId: number
    source: GeoSourceName
    attemptKind: GeoIngestAttemptKind
    outcome: GeoIngestOutcome
    httpStatus?: number
    errorCode?: string
    errorDetail?: Record<string, unknown>
    itemsIngested?: number
    latencyMs?: number
    correlationId?: string
  }): Promise<GeoIngestAttempt> {
    log.debug(
      {
        gameId: input.gameId,
        source: input.source,
        kind: input.attemptKind,
        outcome: input.outcome,
      },
      'record',
    )
    const [row] = await db('geo_ingest_attempt')
      .insert({
        game_id: input.gameId,
        source: input.source,
        attempt_kind: input.attemptKind,
        outcome: input.outcome,
        http_status: input.httpStatus ?? null,
        error_code: input.errorCode ?? null,
        error_detail: input.errorDetail ? JSON.stringify(input.errorDetail) : null,
        items_ingested: input.itemsIngested ?? 0,
        latency_ms: input.latencyMs ?? null,
        correlation_id: input.correlationId ?? null,
      })
      .returning<Row[]>('*')
    return rowTo(row!)
  },

  async listForGame(gameId: number, limit = 50): Promise<GeoIngestAttempt[]> {
    const rows = await db('geo_ingest_attempt')
      .where({ game_id: gameId })
      .orderBy('attempted_at', 'desc')
      .limit(limit)
      .select<Row[]>('*')
    return rows.map(rowTo)
  },

  // True if (game, source) had a failure within the last `cooldownSeconds`.
  // Replaces the old single-row tombstone — different sources never block each
  // other, and the cooldown window is computed from history rather than a
  // fixed flag.
  async isInCooldown(
    gameId: number,
    source: GeoSourceName,
    cooldownSeconds: number,
  ): Promise<boolean> {
    const result = await db.raw<{ rows: Array<{ exists: boolean }> }>(
      `
      SELECT EXISTS (
        SELECT 1
        FROM geo_ingest_attempt
        WHERE game_id = ?
          AND source = ?
          AND outcome <> 'success'
          AND attempted_at > NOW() - (? * INTERVAL '1 second')
      ) AS exists
      `,
      [gameId, source, cooldownSeconds],
    )
    return result.rows[0]?.exists === true
  },

  // Most recent outcome for (game, source). Used by the orchestrator to
  // decide whether to advance to the next source or retry the same one.
  async findLatest(
    gameId: number,
    source: GeoSourceName,
  ): Promise<GeoIngestAttempt | null> {
    const row = await db('geo_ingest_attempt')
      .where({ game_id: gameId, source })
      .orderBy('attempted_at', 'desc')
      .first<Row>()
    return row ? rowTo(row) : null
  },

  // Per-source consecutive failure count, used for exponential cooldown.
  async countRecentFailures(
    gameId: number,
    source: GeoSourceName,
    sinceSeconds: number,
  ): Promise<number> {
    const result = await db.raw<{ rows: Array<{ count: string }> }>(
      `
      SELECT COUNT(*)::text AS count
      FROM geo_ingest_attempt
      WHERE game_id = ?
        AND source = ?
        AND outcome <> 'success'
        AND attempted_at > NOW() - (? * INTERVAL '1 second')
      `,
      [gameId, source, sinceSeconds],
    )
    return Number(result.rows[0]?.count ?? 0)
  },
}
