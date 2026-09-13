import { db } from '../database/connection.js'
import { repoLogger } from '../logger/logger.js'

const log = repoLogger.child({ repository: 'geo-ingest-failure' })

export type GeoIngestSource =
  | 'fandom'
  | 'steam'
  | 'rawg'
  | 'metadata'
  | 'registry'
  | 'strategywiki'
  | 'fextralife'
  | 'wand'
  | 'wikidata'

export interface GeoIngestFailureRow {
  game_id: number
  source: GeoIngestSource
  reason: string
  attempt_count: number
  last_attempt_at: Date
  retry_after: Date
}

export const geoIngestFailureRepository = {
  /**
   * Record a permanent (or temporarily unrecoverable) failure for a given
   * (game, source). On conflict bumps `attempt_count` and refreshes
   * `retry_after`. The tick query LEFT JOINs this table and skips rows
   * where `retry_after > now()`.
   */
  async record(input: {
    gameId: number
    source: GeoIngestSource
    reason: string
    retryAfter: Date
  }): Promise<void> {
    log.info(
      { gameId: input.gameId, source: input.source, reason: input.reason },
      'record',
    )
    await db.raw(
      `INSERT INTO geo_ingest_failure (game_id, source, reason, attempt_count, last_attempt_at, retry_after)
       VALUES (?, ?, ?, 1, NOW(), ?)
       ON CONFLICT (game_id, source) DO UPDATE SET
         reason = EXCLUDED.reason,
         attempt_count = geo_ingest_failure.attempt_count + 1,
         last_attempt_at = NOW(),
         retry_after = EXCLUDED.retry_after`,
      [input.gameId, input.source, input.reason.slice(0, 500), input.retryAfter],
    )
  },

  async clear(gameId: number, source: GeoIngestSource): Promise<void> {
    await db('geo_ingest_failure').where({ game_id: gameId, source }).del()
  },

  /**
   * Clear the tombstones for several sources at once. Used when an operator
   * (or an agent) supplies a map by hand: the automated tiers' past failures
   * should no longer suppress retries now that the blocker is gone.
   */
  async clearSources(gameId: number, sources: readonly GeoIngestSource[]): Promise<void> {
    if (sources.length === 0) return
    await db('geo_ingest_failure')
      .where({ game_id: gameId })
      .whereIn('source', [...sources])
      .del()
  },

  /** Every recorded failure for one game, newest attempt first. */
  async listByGame(gameId: number): Promise<GeoIngestFailureRow[]> {
    return db('geo_ingest_failure')
      .where({ game_id: gameId })
      .orderBy('last_attempt_at', 'desc')
      .select<GeoIngestFailureRow[]>(
        'source',
        'reason',
        'attempt_count',
        'last_attempt_at',
        'retry_after',
      )
  },

  async findActive(gameId: number, source: GeoIngestSource): Promise<GeoIngestFailureRow | null> {
    const row = await db('geo_ingest_failure')
      .where({ game_id: gameId, source })
      .first<GeoIngestFailureRow>()
    return row ?? null
  },

  async getAttemptCount(gameId: number, source: GeoIngestSource): Promise<number> {
    const row = await this.findActive(gameId, source)
    return row?.attempt_count ?? 0
  },

  async listAll(): Promise<GeoIngestFailureRow[]> {
    return db('geo_ingest_failure')
      .orderBy('last_attempt_at', 'desc')
      .select<GeoIngestFailureRow[]>('*')
  },
}
