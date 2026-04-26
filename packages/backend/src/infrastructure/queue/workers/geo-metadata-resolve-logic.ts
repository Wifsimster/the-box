import { db } from '../../database/connection.js'
import { queueLogger } from '../../logger/logger.js'
import { geoIngestFailureRepository } from '../../repositories/index.js'
import {
  FANDOM_MAP_NAMESPACE,
  extractVersionTokens,
  isMapEligibleByGenre,
  normalizeGameTitle,
  scoreMapTitle,
  versionTokensMatch,
  wikiSubdomainCandidates,
} from '../../../domain/services/geo-metadata.service.js'
import { resolveWikidataQid } from './geo-wikidata-import-logic.js'
import { findRegistryEntryBySlug } from './geo-registry-import-logic.js'

const log = queueLogger.child({ worker: 'geo-metadata-resolve' })

const DEFAULT_USER_AGENT =
  'the-box-geo-importer/1.0 (+https://github.com/Wifsimster/the-box)'
const STEAM_STORESEARCH = 'https://store.steampowered.com/api/storesearch/'
const FANDOM_BASE = (sub: string) => `https://${sub}.fandom.com`
const MAP_TITLE_PREFIX = 'Map:'

interface CuratedGameRow {
  id: number
  name: string
  slug: string
  genres: string[] | null
  steam_app_id: number | null
  wiki_subdomain: string | null
  wiki_page_title: string | null
  wikidata_qid: string | null
}

export interface ResolveMetadataResult {
  scanned: number
  resolved: number
  unresolved: number
  skipped: number
}

/**
 * Resolve missing Steam app id, wiki subdomain, and Fandom Interactive Map
 * page name for curated games (`geo_curated = true`,
 * `geo_metadata_status = 'pending'`).
 *
 * Strategy:
 *   1. Steam app id — hit Steam `storesearch`, pick the first hit whose
 *      normalized title matches the game name.
 *   2. Wiki subdomain + Map: page name — for each `<slug-variant>.fandom.com`,
 *      list pages in the Fandom Interactive Maps namespace
 *      (`?action=query&list=allpages&apnamespace=2900`). The first
 *      subdomain that returns at least one map wins; we score the returned
 *      titles and keep the highest-scoring one (without the `Map:` prefix).
 *
 * On any success → status='resolved'. On total failure → status='unresolved'
 * + tombstone with exponential backoff so we don't loop.
 */
export async function resolveGeoMetadataBatch(
  batchSize = 25,
  gameId?: number,
): Promise<ResolveMetadataResult> {
  // When `gameId` is set we run the resolver for that single game regardless
  // of its current `geo_metadata_status` — manual admin runs need to re-resolve
  // a 'resolved' or 'unresolved' game without an extra round-trip to flip the
  // column first. Batch (recurring) runs keep the 'pending' filter so already
  // resolved games aren't re-resolved every tick.
  const query = db<CuratedGameRow>('games').where('geo_curated', true)
  if (gameId === undefined) {
    query.where('geo_metadata_status', 'pending').orderBy('id').limit(batchSize)
  } else {
    query.where('id', gameId)
  }
  const rows = await query.select<CuratedGameRow[]>(
    'id',
    'name',
    'slug',
    'genres',
    'steam_app_id',
    'wiki_subdomain',
    'wiki_page_title',
    'wikidata_qid',
  )

  let resolved = 0
  let unresolved = 0
  let skipped = 0

  for (const row of rows) {
    try {
      const steamAppId = row.steam_app_id ?? (await resolveSteamAppId(row.name))
      const wiki =
        row.wiki_subdomain && row.wiki_page_title
          ? { subdomain: row.wiki_subdomain, mapName: row.wiki_page_title }
          : await resolveFandomInteractiveMap(row.name, row.slug)
      // Tier 3 (Wikidata P242 locator) only meaningfully exists for
      // open-world / exploration games. Skipping the lookup for
      // genre-ineligible games avoids tombstoning Wikidata forever on
      // every Puzzle/Platformer/Racing title in the catalog.
      const genreEligible = isMapEligibleByGenre(row.genres)
      const wikidataQid =
        row.wikidata_qid ??
        (genreEligible === false ? null : await resolveWikidataQid(row.name))
      // Tier 1 hit short-circuits the "did we find anything" check — even if
      // Steam/Fandom/Wikidata all whiff, a curated registry entry is enough
      // to mark this game `resolved` and let the tick enqueue the import.
      // The StrategyWiki and Fextralife tiers don't need pre-resolution
      // (they probe upstream APIs inline using just the game name + slug),
      // so every curated game implicitly has at least those two fallbacks
      // — we no longer mark `unresolved` here. Per-tier tombstones still
      // enforce backoff if every tier whiffs at import time.
      const hasRegistry = (await findRegistryEntryBySlug(row.slug)) !== null

      await db('games')
        .where({ id: row.id })
        .update({
          steam_app_id: steamAppId,
          wiki_subdomain: wiki?.subdomain ?? row.wiki_subdomain,
          wiki_page_title: wiki?.mapName ?? row.wiki_page_title,
          wikidata_qid: wikidataQid ?? row.wikidata_qid,
          geo_metadata_status: 'resolved',
          geo_metadata_resolved_at: new Date(),
        })
      await geoIngestFailureRepository.clear(row.id, 'metadata')
      resolved++
      log.info(
        { gameId: row.id, steamAppId, wiki, wikidataQid, hasRegistry },
        'resolved geo metadata',
      )
    } catch (err) {
      log.warn({ gameId: row.id, err: String(err) }, 'metadata resolution error')
      skipped++
    }
  }

  return { scanned: rows.length, resolved, unresolved, skipped }
}

async function resolveSteamAppId(name: string): Promise<number | null> {
  try {
    const url = `${STEAM_STORESEARCH}?term=${encodeURIComponent(name)}&l=en&cc=us`
    const res = await fetch(url, {
      headers: { 'User-Agent': DEFAULT_USER_AGENT, Accept: 'application/json' },
    })
    if (!res.ok) return null
    const body = (await res.json()) as { items?: Array<{ id: number; name: string }> }
    if (!body.items?.length) return null
    const target = normalizeGameTitle(name)
    // Exact normalized match always wins (handles "Game™" → "Game" trims).
    const exact = body.items.find((it) => normalizeGameTitle(it.name) === target)
    if (exact) return exact.id
    // Steam's storesearch happily returns sequels alongside the original
    // entry — searching "Baldur's Gate" returns "Baldur's Gate II: Enhanced
    // Edition" first. Falling back to `items[0]` would silently bind the
    // curated row to the wrong appid and pollute the candidates list with
    // sequel screenshots. Filter to items whose version tokens match the
    // target (no extra "ii" / "2" / "3" introduced).
    const targetTokens = extractVersionTokens(target)
    const compatible = body.items.find((it) =>
      versionTokensMatch(targetTokens, extractVersionTokens(normalizeGameTitle(it.name))),
    )
    if (compatible) {
      log.info(
        { name, picked: compatible.name, appId: compatible.id },
        'steam storesearch picked first version-compatible hit',
      )
      return compatible.id
    }
    log.warn(
      { name, top: body.items[0]?.name },
      'steam storesearch had no version-compatible hit',
    )
    return null
  } catch (err) {
    log.warn({ name, err: String(err) }, 'steam storesearch failed')
    return null
  }
}

interface AllPagesResponse {
  query?: { allpages?: Array<{ title: string }> }
}

/**
 * Walk subdomain candidates and ask each wiki for its `Map:` namespace
 * via `action=query&list=allpages&apnamespace=2900`. The first subdomain
 * that returns ≥1 map wins; we then score those titles to pick the most
 * "main" map and strip the `Map:` prefix before storing.
 */
async function resolveFandomInteractiveMap(
  gameName: string,
  slug: string,
): Promise<{ subdomain: string; mapName: string } | null> {
  for (const sub of wikiSubdomainCandidates(slug)) {
    const url =
      `${FANDOM_BASE(sub)}/api.php?action=query&format=json` +
      `&list=allpages&apnamespace=${FANDOM_MAP_NAMESPACE}&aplimit=100`
    let body: AllPagesResponse
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': DEFAULT_USER_AGENT, Accept: 'application/json' },
      })
      if (!res.ok) continue
      body = (await res.json()) as AllPagesResponse
    } catch {
      continue
    }

    const pages = body.query?.allpages ?? []
    if (!pages.length) continue

    const ranked = pages
      .map((p) => stripMapPrefix(p.title))
      .filter((t): t is string => Boolean(t))
      .map((title) => ({ title, score: scoreMapTitle(title, gameName, slug) }))
      .sort((a, b) => b.score - a.score)

    const best = ranked[0]
    if (best) {
      log.info(
        { sub, choice: best, candidates: ranked.length },
        'fandom map discovered',
      )
      return { subdomain: sub, mapName: best.title }
    }
  }
  return null
}

function stripMapPrefix(title: string): string | null {
  if (!title.startsWith(MAP_TITLE_PREFIX)) return null
  const stripped = title.slice(MAP_TITLE_PREFIX.length).trim()
  return stripped || null
}
