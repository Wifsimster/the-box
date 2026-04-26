import { db } from '../../database/connection.js'
import { queueLogger } from '../../logger/logger.js'
import { geoQueue } from '../queues.js'
import { geoMapRepository } from '../../repositories/index.js'
import { findRegistryEntryBySlug } from './geo-registry-import-logic.js'

const log = queueLogger.child({ worker: 'geo-ingest-tick' })

const DEFAULT_BATCH = 25
const STEAM_TARGET_CANDIDATES = 30 // stop fetching Steam shots once we have this many

interface TickRow {
  id: number
  name: string
  slug: string
  steam_app_id: number | null
  wiki_subdomain: string | null
  wiki_page_title: string | null
  wikidata_qid: string | null
  active_map_id: number | null
  candidate_count: number
}

export interface IngestTickResult {
  scanned: number
  registryEnqueued: number
  fandomEnqueued: number
  strategyWikiEnqueued: number
  fextralifeEnqueued: number
  wikidataEnqueued: number
  steamEnqueued: number
}

/**
 * One pass over curated, resolved games. For each game without an active map,
 * try the ingestion tiers in order and enqueue the first eligible job:
 *   1. `registry`     — curated GitHub Leaflet repo (if entry exists for slug)
 *   2. `fandom`       — Fandom Interactive Maps (if wiki_subdomain + map page resolved)
 *   3. `strategywiki` — StrategyWiki MediaWiki API (CC-BY-SA, no pre-resolution)
 *   4. `fextralife`   — Fextralife wiki og:image scrape (RPG / Soulsborne coverage)
 *   5. `wikidata`     — Wikidata P242 locator map (if wikidata_qid resolved)
 *
 * Tiers 3 and 4 don't require pre-resolution — they probe the upstream API
 * inline using the game slug + name, so a game can succeed there even if
 * the metadata resolver couldn't find a Fandom subdomain or Wikidata Q-id.
 *
 * Tier 0 is implicit: if `geo_map` already has an active row (e.g. via
 * `manual` upload), no map-import is enqueued at all — only the Steam
 * screenshot top-up runs.
 *
 * Each tier is gated by its own tombstone, so a permanently-failing tier
 * doesn't block the next one. Idempotency is preserved via deterministic
 * jobIds + the importers' own `findActiveByGameId` short-circuit.
 */
export async function runGeoIngestTick(
  batchSize = DEFAULT_BATCH,
  gameId?: number,
): Promise<IngestTickResult> {
  // When `gameId` is set the tick runs only for that single game (and ignores
  // the LIMIT). Used by the admin "Run for this game" button so an operator
  // can replay the cascade for a specific row without scanning the catalog.
  const params: Array<number | null> =
    gameId === undefined ? [null, batchSize] : [gameId, null]
  const rows = await db
    .raw<{ rows: TickRow[] }>(
      `
      SELECT
        g.id,
        g.name,
        g.slug,
        g.steam_app_id,
        g.wiki_subdomain,
        g.wiki_page_title,
        g.wikidata_qid,
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
        AND (?::int IS NULL OR g.id = ?::int)
      ORDER BY g.id
      LIMIT COALESCE(?::int, 2147483647)
      `,
      [params[0], params[0], params[1]],
    )
    .then((res) => (res as unknown as { rows: TickRow[] }).rows)

  let registryEnqueued = 0
  let fandomEnqueued = 0
  let strategyWikiEnqueued = 0
  let fextralifeEnqueued = 0
  let wikidataEnqueued = 0
  let steamEnqueued = 0

  for (const row of rows) {
    if (!row.active_map_id) {
      const enqueued = await enqueueFirstAvailableMapImport(row)
      if (enqueued === 'registry') registryEnqueued++
      else if (enqueued === 'fandom') fandomEnqueued++
      else if (enqueued === 'strategywiki') strategyWikiEnqueued++
      else if (enqueued === 'fextralife') fextralifeEnqueued++
      else if (enqueued === 'wikidata') wikidataEnqueued++
    }

    if (
      row.active_map_id &&
      row.candidate_count < STEAM_TARGET_CANDIDATES &&
      row.steam_app_id
    ) {
      const skip = await tombstoneBlocks(row.id, 'steam')
      if (!skip) {
        // Re-fetch the active map id off the repo so we don't pass a stale
        // value (the SELECT above can be racing a recent map import).
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
            { jobId: `auto-steam-${row.id}-${map.id}` },
          )
          steamEnqueued++
        }
      }
    }
  }

  log.info(
    {
      scanned: rows.length,
      registryEnqueued,
      fandomEnqueued,
      strategyWikiEnqueued,
      fextralifeEnqueued,
      wikidataEnqueued,
      steamEnqueued,
    },
    'geo-ingest-tick run',
  )
  return {
    scanned: rows.length,
    registryEnqueued,
    fandomEnqueued,
    strategyWikiEnqueued,
    fextralifeEnqueued,
    wikidataEnqueued,
    steamEnqueued,
  }
}

type MapTier = 'registry' | 'fandom' | 'strategywiki' | 'fextralife' | 'wikidata' | null

async function enqueueFirstAvailableMapImport(row: TickRow): Promise<MapTier> {
  // Tier 1 — registry
  if (!(await tombstoneBlocks(row.id, 'registry'))) {
    const entry = await findRegistryEntryBySlug(row.slug)
    if (entry) {
      await geoQueue.add(
        'import-registry-map',
        { kind: 'import-registry-map', gameId: row.id, entry },
        { jobId: `auto-registry-${row.id}` },
      )
      return 'registry'
    }
  }

  // Tier 2 — Fandom Interactive Maps
  if (
    row.wiki_subdomain &&
    row.wiki_page_title &&
    !(await tombstoneBlocks(row.id, 'fandom'))
  ) {
    await geoQueue.add(
      'import-fandom-map',
      {
        kind: 'import-fandom-map',
        gameId: row.id,
        wikiSubdomain: row.wiki_subdomain,
        pageTitle: row.wiki_page_title,
      },
      { jobId: `auto-fandom-${row.id}` },
    )
    return 'fandom'
  }

  // Tier 3 — StrategyWiki (no pre-resolution required; probes via opensearch)
  if (!(await tombstoneBlocks(row.id, 'strategywiki'))) {
    await geoQueue.add(
      'import-strategywiki-map',
      {
        kind: 'import-strategywiki-map',
        gameId: row.id,
        gameName: row.name,
        slug: row.slug,
      },
      { jobId: `auto-strategywiki-${row.id}` },
    )
    return 'strategywiki'
  }

  // Tier 4 — Fextralife (no pre-resolution required; probes by slug)
  if (!(await tombstoneBlocks(row.id, 'fextralife'))) {
    await geoQueue.add(
      'import-fextralife-map',
      {
        kind: 'import-fextralife-map',
        gameId: row.id,
        gameName: row.name,
        slug: row.slug,
      },
      { jobId: `auto-fextralife-${row.id}` },
    )
    return 'fextralife'
  }

  // Tier 5 — Wikidata P242 fallback
  if (row.wikidata_qid && !(await tombstoneBlocks(row.id, 'wikidata'))) {
    await geoQueue.add(
      'import-wikidata-map',
      { kind: 'import-wikidata-map', gameId: row.id, wikidataQid: row.wikidata_qid },
      { jobId: `auto-wikidata-${row.id}` },
    )
    return 'wikidata'
  }

  return null
}

async function tombstoneBlocks(
  gameId: number,
  source:
    | 'fandom'
    | 'steam'
    | 'registry'
    | 'wikidata'
    | 'strategywiki'
    | 'fextralife',
): Promise<boolean> {
  const row = await db('geo_ingest_failure')
    .where({ game_id: gameId, source })
    .andWhere('retry_after', '>', db.fn.now())
    .first<{ game_id: number }>()
  return Boolean(row)
}
