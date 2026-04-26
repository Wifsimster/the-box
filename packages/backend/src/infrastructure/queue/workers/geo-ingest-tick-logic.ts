import { db } from '../../database/connection.js'
import { env } from '../../../config/env.js'
import { queueLogger } from '../../logger/logger.js'
import { geoQueue } from '../queues.js'
import { geoMapRepository } from '../../repositories/index.js'
import { findRegistryEntryBySlug } from './geo-registry-import-logic.js'

const log = queueLogger.child({ worker: 'geo-ingest-tick' })

const DEFAULT_BATCH = 25
// Combined cap across every capture provider (Steam + RAWG). Once a game
// has this many active candidates we stop enqueuing more — admins can
// reject duds and the next tick will top up.
const CAPTURE_TARGET_CANDIDATES = 30

interface TickRow {
  id: number
  name: string
  slug: string
  steam_app_id: number | null
  rawg_id: number | null
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
  rawgEnqueued: number
}

/**
 * One pass over curated, resolved games. For each game we enqueue **every**
 * eligible ingestion tier so the admin can compare results and pick the best
 * map per game (instead of only the first tier to land winning by default):
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
 * The first tier to successfully insert a row becomes the default active map
 * (so games stay playable). Subsequent tiers store their results as inactive
 * candidates — visible in the admin Maps tab side panel where an operator
 * can swap which one is active for the game.
 *
 * Each tier is gated by its own tombstone, so a permanently-failing tier
 * doesn't block the next one. Idempotency is preserved via deterministic
 * jobIds + the importers' per-source `findBySourceAndGameId` short-circuit.
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
        g.rawg_id,
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
  let rawgEnqueued = 0

  const rawgEnabled = Boolean(env.RAWG_API_KEY)

  for (const row of rows) {
    const enqueued = await enqueueAllEligibleMapImports(row)
    registryEnqueued += enqueued.registry
    fandomEnqueued += enqueued.fandom
    strategyWikiEnqueued += enqueued.strategywiki
    fextralifeEnqueued += enqueued.fextralife
    wikidataEnqueued += enqueued.wikidata

    // Capture providers (Steam + RAWG) only run once an active map exists,
    // so pins have something to anchor to. Both are enqueued in parallel
    // when below the combined cap — they return different screenshots
    // (Steam = publisher store-page shots, RAWG = aggregated incl.
    // Switch / console / mobile titles that aren't on Steam) so running
    // both is strictly additive. (source, external_id) uniqueness in
    // geo_screenshot_candidate prevents dupes inside each provider.
    if (row.active_map_id && row.candidate_count < CAPTURE_TARGET_CANDIDATES) {
      // Re-fetch the active map id off the repo so we don't pass a stale
      // value (the SELECT above can be racing a recent map import).
      const map = await geoMapRepository.findActiveByGameId(row.id)
      if (map) {
        if (row.steam_app_id && !(await tombstoneBlocks(row.id, 'steam'))) {
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

        if (
          rawgEnabled &&
          row.rawg_id &&
          !(await tombstoneBlocks(row.id, 'rawg'))
        ) {
          await geoQueue.add(
            'import-rawg-screenshots',
            {
              kind: 'import-rawg-screenshots',
              gameId: row.id,
              geoMapId: map.id,
              rawgId: row.rawg_id,
            },
            { jobId: `auto-rawg-${row.id}-${map.id}` },
          )
          rawgEnqueued++
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
      rawgEnqueued,
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
    rawgEnqueued,
  }
}

interface TierEnqueueTally {
  registry: number
  fandom: number
  strategywiki: number
  fextralife: number
  wikidata: number
}

async function enqueueAllEligibleMapImports(row: TickRow): Promise<TierEnqueueTally> {
  const tally: TierEnqueueTally = {
    registry: 0,
    fandom: 0,
    strategywiki: 0,
    fextralife: 0,
    wikidata: 0,
  }

  // Tier 1 — registry
  if (!(await tombstoneBlocks(row.id, 'registry'))) {
    const entry = await findRegistryEntryBySlug(row.slug)
    if (entry) {
      await geoQueue.add(
        'import-registry-map',
        { kind: 'import-registry-map', gameId: row.id, entry },
        { jobId: `auto-registry-${row.id}` },
      )
      tally.registry++
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
    tally.fandom++
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
    tally.strategywiki++
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
    tally.fextralife++
  }

  // Tier 5 — Wikidata P242 fallback
  if (row.wikidata_qid && !(await tombstoneBlocks(row.id, 'wikidata'))) {
    await geoQueue.add(
      'import-wikidata-map',
      { kind: 'import-wikidata-map', gameId: row.id, wikidataQid: row.wikidata_qid },
      { jobId: `auto-wikidata-${row.id}` },
    )
    tally.wikidata++
  }

  return tally
}

async function tombstoneBlocks(
  gameId: number,
  source:
    | 'fandom'
    | 'steam'
    | 'rawg'
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

export type RunnableTier =
  | 'registry'
  | 'fandom'
  | 'strategywiki'
  | 'fextralife'
  | 'wikidata'

export type SingleTierFailure =
  | 'GAME_NOT_FOUND'
  | 'NOT_CURATED'
  | 'METADATA_UNRESOLVED'
  | 'NO_REGISTRY_ENTRY'
  | 'MISSING_FANDOM_METADATA'
  | 'MISSING_WIKIDATA_QID'

export type EnqueueSingleTierResult =
  | { enqueued: true; jobId: string }
  | { enqueued: false; reason: SingleTierFailure }

interface SingleTierGameRow {
  id: number
  name: string
  slug: string
  wiki_subdomain: string | null
  wiki_page_title: string | null
  wikidata_qid: string | null
  geo_curated: boolean
  geo_metadata_status: 'pending' | 'resolved' | 'unresolved'
}

/**
 * Enqueue a single tier's import job for one game. Used by the admin "Run now"
 * button on the per-tier eligible row, which lets an operator kick off just
 * that source instead of the whole cascade. Tombstones are intentionally not
 * checked: the UI only surfaces this for `eligible` tiers (no live tombstone),
 * and bypassing the gate makes the button do exactly what it says.
 */
export async function enqueueSingleTierImport(
  gameId: number,
  source: RunnableTier,
): Promise<EnqueueSingleTierResult> {
  const game = await db<SingleTierGameRow>('games')
    .where({ id: gameId })
    .select(
      'id',
      'name',
      'slug',
      'wiki_subdomain',
      'wiki_page_title',
      'wikidata_qid',
      'geo_curated',
      'geo_metadata_status',
    )
    .first()
  if (!game) return { enqueued: false, reason: 'GAME_NOT_FOUND' }
  if (!game.geo_curated) return { enqueued: false, reason: 'NOT_CURATED' }
  if (game.geo_metadata_status !== 'resolved')
    return { enqueued: false, reason: 'METADATA_UNRESOLVED' }

  const jobId = `manual-${source}-${gameId}`

  if (source === 'registry') {
    const entry = await findRegistryEntryBySlug(game.slug)
    if (!entry) return { enqueued: false, reason: 'NO_REGISTRY_ENTRY' }
    await geoQueue.add(
      'import-registry-map',
      { kind: 'import-registry-map', gameId, entry },
      { jobId },
    )
    return { enqueued: true, jobId }
  }

  if (source === 'fandom') {
    if (!game.wiki_subdomain || !game.wiki_page_title)
      return { enqueued: false, reason: 'MISSING_FANDOM_METADATA' }
    await geoQueue.add(
      'import-fandom-map',
      {
        kind: 'import-fandom-map',
        gameId,
        wikiSubdomain: game.wiki_subdomain,
        pageTitle: game.wiki_page_title,
      },
      { jobId },
    )
    return { enqueued: true, jobId }
  }

  if (source === 'strategywiki') {
    await geoQueue.add(
      'import-strategywiki-map',
      {
        kind: 'import-strategywiki-map',
        gameId,
        gameName: game.name,
        slug: game.slug,
      },
      { jobId },
    )
    return { enqueued: true, jobId }
  }

  if (source === 'fextralife') {
    await geoQueue.add(
      'import-fextralife-map',
      {
        kind: 'import-fextralife-map',
        gameId,
        gameName: game.name,
        slug: game.slug,
      },
      { jobId },
    )
    return { enqueued: true, jobId }
  }

  // wikidata
  if (!game.wikidata_qid)
    return { enqueued: false, reason: 'MISSING_WIKIDATA_QID' }
  await geoQueue.add(
    'import-wikidata-map',
    { kind: 'import-wikidata-map', gameId, wikidataQid: game.wikidata_qid },
    { jobId },
  )
  return { enqueued: true, jobId }
}
