import { db } from '../../database/connection.js'
import { queueLogger } from '../../logger/logger.js'
import { geoIngestFailureRepository } from '../../repositories/index.js'
import {
  FANDOM_MAP_NAMESPACE,
  normalizeGameTitle,
  scoreMapTitle,
  tombstoneRetryAfter,
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
): Promise<ResolveMetadataResult> {
  const rows = await db<CuratedGameRow>('games')
    .where('geo_curated', true)
    .where('geo_metadata_status', 'pending')
    .orderBy('id')
    .limit(batchSize)
    .select<CuratedGameRow[]>(
      'id',
      'name',
      'slug',
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
      const wikidataQid =
        row.wikidata_qid ?? (await resolveWikidataQid(row.name))
      // Tier 1 hit short-circuits the "did we find anything" check — even if
      // Steam/Fandom/Wikidata all whiff, a curated registry entry is enough
      // to mark this game `resolved` and let the tick enqueue the import.
      const hasRegistry = (await findRegistryEntryBySlug(row.slug)) !== null

      const haveAnything =
        hasRegistry || Boolean(steamAppId) || Boolean(wiki) || Boolean(wikidataQid)
      if (!haveAnything) {
        const attempt =
          (await geoIngestFailureRepository.getAttemptCount(row.id, 'metadata')) + 1
        await geoIngestFailureRepository.record({
          gameId: row.id,
          source: 'metadata',
          reason:
            'no registry entry, Steam appid, Fandom map, or Wikidata Q-id found',
          retryAfter: tombstoneRetryAfter(attempt),
        })
        await db('games')
          .where({ id: row.id })
          .update({ geo_metadata_status: 'unresolved' })
        unresolved++
        continue
      }

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
    const hit =
      body.items.find((it) => normalizeGameTitle(it.name) === target) ?? body.items[0]
    return hit?.id ?? null
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
