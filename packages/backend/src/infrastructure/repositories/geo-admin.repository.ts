/**
 * Geo moderation repository.
 *
 * The cross-table reads behind the admin Geo panel — the coverage snapshot
 * and the per-tab game lists. They span `games`, `geo_map`,
 * `geo_screenshot_candidate` and `geo_challenge`, so they belong to no single
 * aggregate repository; this module owns the moderation view of them.
 */
import { db } from '../database/connection.js'

/** How much of the catalog is geo-ready, in absolute counts. */
export interface GeoCoverageCounts {
  curated: string
  resolved: string
  with_map: string
  total: string
}

/** A curated game plus its map/candidate tallies, for the moderation list. */
export interface CuratedGeoGameRow {
  id: number
  name: string
  slug: string
  release_year: number | null
  developer: string | null
  metacritic: number | null
  genres: string[] | null
  geo_metadata_status: string
  steam_app_id: number | null
  wiki_subdomain: string | null
  has_map: boolean
  map_count: number
  candidate_count: number
}

/** A not-yet-curated game, ranked by Metacritic as a curation shortlist. */
export interface UncuratedGeoGameRow {
  id: number
  name: string
  slug: string
  release_year: number | null
  developer: string | null
  metacritic: number | null
  genres: string[] | null
}

export const geoAdminRepository = {
  /**
   * Catalog coverage: how many games are curated, how many of those resolved
   * their metadata, and how many have at least one active map. One pass over
   * `games` with FILTER clauses rather than four round-trips.
   */
  async getCoverageCounts(): Promise<GeoCoverageCounts> {
    const result = await db.raw<{ rows: GeoCoverageCounts[] }>(
      `
      SELECT
        COUNT(*) FILTER (WHERE g.geo_curated)::text AS curated,
        COUNT(*) FILTER (WHERE g.geo_curated AND g.geo_metadata_status = 'resolved')::text AS resolved,
        COUNT(*) FILTER (
          WHERE g.geo_curated
            AND EXISTS (
              SELECT 1 FROM geo_map m
              WHERE m.game_id = g.id AND m.is_active = true
            )
        )::text AS with_map,
        COUNT(*)::text AS total
      FROM games g
      `,
    )
    return (result as unknown as { rows: GeoCoverageCounts[] }).rows[0]!
  },

  /** When the most recent map from a given source landed — an ingest liveness signal. */
  async findLatestMapAt(source: string): Promise<Date | null> {
    const row = await db('geo_map')
      .where('source', source)
      .orderBy('created_at', 'desc')
      .first<{ created_at: Date }>('created_at')
    return row?.created_at ?? null
  },

  /** When the most recent capture candidate from a given source landed. */
  async findLatestCandidateAt(source: string): Promise<Date | null> {
    const row = await db('geo_screenshot_candidate')
      .where('source', source)
      .orderBy('created_at', 'desc')
      .first<{ created_at: Date }>('created_at')
    return row?.created_at ?? null
  },

  /** The next scheduled geo challenge from today onward, or null if none is queued. */
  async findNextChallenge(): Promise<{ id: number; challenge_date: string } | null> {
    const row = await db('geo_challenge')
      .where('challenge_date', '>=', new Date().toISOString().slice(0, 10))
      .orderBy('challenge_date', 'asc')
      .first<{ id: number; challenge_date: string }>('id', 'challenge_date')
    return row ?? null
  },

  /**
   * Curated games with their active-map and live-candidate tallies.
   *
   * The LATERAL join picks the newest active map for the `has_map` flag while
   * the grouped subqueries count all of them — a plain join would multiply
   * rows and inflate both counts.
   */
  async listCuratedGames(limit: number): Promise<CuratedGeoGameRow[]> {
    const result = await db.raw<{ rows: CuratedGeoGameRow[] }>(
      `
      SELECT
        g.id,
        g.name,
        g.slug,
        g.release_year,
        g.developer,
        g.metacritic,
        g.genres,
        g.geo_metadata_status,
        g.steam_app_id,
        g.wiki_subdomain,
        (m.id IS NOT NULL) AS has_map,
        COALESCE(mc.cnt, 0)::int AS map_count,
        COALESCE(c.cnt, 0)::int AS candidate_count
      FROM games g
      LEFT JOIN LATERAL (
        SELECT id FROM geo_map
        WHERE game_id = g.id AND is_active = true
        ORDER BY created_at DESC
        LIMIT 1
      ) m ON true
      LEFT JOIN (
        SELECT game_id, COUNT(*)::int AS cnt
        FROM geo_map
        WHERE is_active = true
        GROUP BY game_id
      ) mc ON mc.game_id = g.id
      LEFT JOIN (
        SELECT game_id, COUNT(*)::int AS cnt
        FROM geo_screenshot_candidate
        WHERE is_active IS NOT FALSE
        GROUP BY game_id
      ) c ON c.game_id = g.id
      WHERE g.geo_curated = true
      ORDER BY g.name
      LIMIT ?
      `,
      [limit],
    )
    return (result as unknown as { rows: CuratedGeoGameRow[] }).rows
  },

  /**
   * Curation shortlist: games not yet curated, best-reviewed first. Games
   * without a Metacritic score are excluded — there is nothing to rank them by.
   */
  async listUncuratedGames(limit: number): Promise<UncuratedGeoGameRow[]> {
    return db('games')
      .where('geo_curated', false)
      .whereNotNull('metacritic')
      .orderBy('metacritic', 'desc')
      .orderBy('name')
      .limit(limit)
      .select<UncuratedGeoGameRow[]>(
        'id',
        'name',
        'slug',
        'release_year',
        'developer',
        'metacritic',
        'genres',
      )
  },

  /**
   * Flip the curation flag on many games atomically.
   *
   * Curating a game resets its metadata to `pending` and clears the metadata
   * tombstone, so the resolver retries a game an operator has just vouched
   * for. One transaction: a crash mid-batch must not leave some games curated
   * with stale tombstones still suppressing their retries.
   */
  async setCurationBulk(
    items: ReadonlyArray<{ gameId: number; curated: boolean }>,
  ): Promise<{ updated: number; notFound: number }> {
    let updated = 0
    let notFound = 0

    await db.transaction(async (trx) => {
      for (const item of items) {
        const update: Record<string, unknown> = { geo_curated: item.curated }
        if (item.curated) update.geo_metadata_status = 'pending'

        const n = await trx('games').where({ id: item.gameId }).update(update)
        if (n === 0) {
          notFound++
          continue
        }

        updated++
        if (item.curated) {
          await trx('geo_ingest_failure')
            .where({ game_id: item.gameId, source: 'metadata' })
            .del()
        }
      }
    })

    return { updated, notFound }
  },

  /**
   * Reset one game to pre-ingestion state: drop every per-source tombstone
   * and clear the resolved metadata so the resolver and tick re-run from
   * scratch.
   *
   * Atomic on purpose — a crash between the two halves would leave the
   * tombstones cleared but the metadata still marked resolved, so the
   * resolver would skip the game and the reimport would silently no-op.
   */
  async resetGameForReimport(gameId: number): Promise<void> {
    await db.transaction(async (trx) => {
      await trx('geo_ingest_failure')
        .where({ game_id: gameId })
        .whereIn('source', [
          'registry',
          'fandom',
          'strategywiki',
          'fextralife',
          'wikidata',
          'steam',
          'metadata',
        ])
        .del()

      await trx('games').where({ id: gameId }).update({
        geo_metadata_status: 'pending',
        wiki_subdomain: null,
        wiki_page_title: null,
        steam_app_id: null,
        wikidata_qid: null,
      })
    })
  },

  /**
   * Wipe every piece of scraping progress and scraped data so the next run
   * starts from zero. Keeps operator curation choices (`games.geo_curated`)
   * and all player-generated data (scores, leaderboards).
   *
   * Cascade order matters and is why this is one transaction:
   *   - `geo_challenge.geo_screenshot_meta_id` is ON DELETE RESTRICT, so
   *     challenges must go first or the geo_map delete fails when its cascade
   *     reaches geo_screenshot_meta;
   *   - `geo_map` cascades to geo_screenshot_candidate + geo_screenshot_meta,
   *     and those cascade to geo_pin / screenshot_reports.geo_* in turn.
   *
   * Destructive: the daily geo challenge returns NO_CHALLENGE until a new map
   * is imported and a challenge scheduled.
   */
  async resetAllScrapingState(): Promise<{
    importStates: number
    ingestFailures: number
    challenges: number
    maps: number
  }> {
    return db.transaction(async (trx) => {
      const importStates = await trx('import_states').delete()
      const ingestFailures = await trx('geo_ingest_failure').delete()

      await trx('games').update({
        geo_metadata_status: 'pending',
        geo_metadata_resolved_at: null,
        wiki_subdomain: null,
        wiki_page_title: null,
        steam_app_id: null,
        wikidata_qid: null,
      })

      const challenges = await trx('geo_challenge').delete()
      const maps = await trx('geo_map').delete()

      return { importStates, ingestFailures, challenges, maps }
    })
  },
}
