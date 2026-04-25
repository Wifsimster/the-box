import { db } from '../../database/connection.js'
import { queueLogger } from '../../logger/logger.js'
import { geoQueue } from '../queues.js'
import { geoMapRepository } from '../../repositories/index.js'

const log = queueLogger.child({ worker: 'geo-ingest-tick' })

const DEFAULT_BATCH = 25
const STEAM_TARGET_CANDIDATES = 30 // stop fetching Steam shots once we have this many

interface TickRow {
  id: number
  steam_app_id: number | null
  wiki_subdomain: string | null
  wiki_page_title: string | null
  active_map_id: number | null
  candidate_count: number
}

export interface IngestTickResult {
  scanned: number
  fandomEnqueued: number
  steamEnqueued: number
}

/**
 * One pass over curated, resolved games. For each:
 *   - if no active geo_map → enqueue `import-fandom-map` (skipped if a
 *     fandom tombstone is still active);
 *   - if a map exists but candidate count is below STEAM_TARGET_CANDIDATES
 *     and a steam_app_id is known → enqueue `import-steam-screenshots`
 *     (skipped if a steam tombstone is still active).
 *
 * Idempotency: the import workers themselves short-circuit on duplicates
 * (`findActiveByGameId` for fandom, `(source, external_id)` unique for
 * steam), so it's safe to enqueue every tick — at worst we waste a few
 * external HTTP calls.
 */
export async function runGeoIngestTick(
  batchSize = DEFAULT_BATCH,
): Promise<IngestTickResult> {
  const rows = await db
    .raw<{ rows: TickRow[] }>(
      `
      SELECT
        g.id,
        g.steam_app_id,
        g.wiki_subdomain,
        g.wiki_page_title,
        m.id AS active_map_id,
        COALESCE(c.cnt, 0) AS candidate_count
      FROM games g
      LEFT JOIN LATERAL (
        SELECT id FROM geo_map
        WHERE game_id = g.id AND is_active = true
        ORDER BY created_at DESC
        LIMIT 1
      ) m ON true
      LEFT JOIN (
        SELECT game_id, COUNT(*)::int AS cnt
        FROM geo_screenshot_candidate
        WHERE is_active IS NOT FALSE
        GROUP BY game_id
      ) c ON c.game_id = g.id
      WHERE g.geo_curated = true
        AND g.geo_metadata_status = 'resolved'
      ORDER BY g.id
      LIMIT ?
      `,
      [batchSize],
    )
    .then((res) => (res as unknown as { rows: TickRow[] }).rows)

  let fandomEnqueued = 0
  let steamEnqueued = 0

  for (const row of rows) {
    if (!row.active_map_id && row.wiki_subdomain && row.wiki_page_title) {
      const skip = await tombstoneBlocks(row.id, 'fandom')
      if (!skip) {
        await geoQueue.add(
          'import-fandom-map',
          {
            kind: 'import-fandom-map',
            gameId: row.id,
            wikiSubdomain: row.wiki_subdomain,
            pageTitle: row.wiki_page_title,
          },
          { jobId: `auto-fandom:${row.id}` },
        )
        fandomEnqueued++
      }
    }

    if (
      row.active_map_id &&
      row.candidate_count < STEAM_TARGET_CANDIDATES &&
      row.steam_app_id
    ) {
      const skip = await tombstoneBlocks(row.id, 'steam')
      if (!skip) {
        // Re-fetch the active map id off the repo so we don't pass a stale
        // value (the SELECT above can be racing a recent fandom-import).
        const map = await geoMapRepository.findActiveByGameId(row.id)
        if (map) {
          await geoQueue.add(
            'import-steam-screenshots',
            {
              kind: 'import-steam-screenshots',
              gameId: row.id,
              geoMapId: map.id,
              steamAppId: row.steam_app_id,
            },
            { jobId: `auto-steam:${row.id}:${map.id}` },
          )
          steamEnqueued++
        }
      }
    }
  }

  log.info(
    { scanned: rows.length, fandomEnqueued, steamEnqueued },
    'geo-ingest-tick run',
  )
  return { scanned: rows.length, fandomEnqueued, steamEnqueued }
}

async function tombstoneBlocks(
  gameId: number,
  source: 'fandom' | 'steam',
): Promise<boolean> {
  const row = await db('geo_ingest_failure')
    .where({ game_id: gameId, source })
    .andWhere('retry_after', '>', db.fn.now())
    .first<{ game_id: number }>()
  return Boolean(row)
}
