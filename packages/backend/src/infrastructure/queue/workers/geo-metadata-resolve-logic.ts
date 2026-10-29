import { db } from '../../database/connection.js'
import { env } from '../../../config/env.js'
import { queueLogger } from '../../logger/logger.js'
import { geoIngestFailureRepository } from '../../repositories/index.js'
import {
  FANDOM_MAP_NAMESPACE,
  extractVersionTokens,
  fandomMapTitleAcceptable,
  isMapEligibleByGenre,
  normalizeGameTitle,
  pickBestMapTitle,
  versionTokensMatch,
  wikiSubdomainCandidates,
} from '../../../domain/services/geo-metadata.service.js'
import { resolveWikidataQid } from './geo-wikidata-import-logic.js'
import { findRegistryEntryBySlug } from './geo-registry-import-logic.js'

const log = queueLogger.child({ worker: 'geo-metadata-resolve' })

const DEFAULT_USER_AGENT =
  'the-box-geo-importer/1.0 (+https://github.com/Wifsimster/the-box)'
const STEAM_STORESEARCH = 'https://store.steampowered.com/api/storesearch/'
const RAWG_API = 'https://api.rawg.io/api'
const FANDOM_BASE = (sub: string) => `https://${sub}.fandom.com`
const MAP_TITLE_PREFIX = 'Map:'

interface CuratedGameRow {
  id: number
  name: string
  slug: string
  genres: string[] | null
  steam_app_id: number | null
  rawg_id: number | null
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

export async function resolveGeoMetadataBatch(
  batchSize = 25,
  gameId?: number,
): Promise<ResolveMetadataResult> {
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
    'rawg_id',
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
      const rawgId =
        row.rawg_id ?? (env.RAWG_API_KEY ? await resolveRawgId(row.name) : null)
      const wiki =
        row.wiki_subdomain && row.wiki_page_title
          ? { subdomain: row.wiki_subdomain, mapName: row.wiki_page_title }
          : await resolveFandomInteractiveMap(row.name, row.slug)
      const genreEligible = isMapEligibleByGenre(row.genres)
      const wikidataQid =
        row.wikidata_qid ??
        (genreEligible === false ? null : await resolveWikidataQid(row.name))
      const hasRegistry = (await findRegistryEntryBySlug(row.slug)) !== null

      await db('games')
        .where({ id: row.id })
        .update({
          steam_app_id: steamAppId,
          rawg_id: rawgId,
          wiki_subdomain: wiki?.subdomain ?? row.wiki_subdomain,
          wiki_page_title: wiki?.mapName ?? row.wiki_page_title,
          wikidata_qid: wikidataQid ?? row.wikidata_qid,
          geo_metadata_status: 'resolved',
          geo_metadata_resolved_at: new Date(),
        })
      await geoIngestFailureRepository.clear(row.id, 'metadata')
      resolved++
      log.info(
        { gameId: row.id, steamAppId, rawgId, wiki, wikidataQid, hasRegistry },
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
    const exact = body.items.find((it) => normalizeGameTitle(it.name) === target)
    if (exact) return exact.id
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

async function resolveRawgId(name: string): Promise<number | null> {
  const apiKey = env.RAWG_API_KEY
  if (!apiKey) return null
  try {
    const url =
      `${RAWG_API}/games?key=${encodeURIComponent(apiKey)}` +
      `&search=${encodeURIComponent(name)}&page_size=10`
    const res = await fetch(url, {
      headers: { 'User-Agent': DEFAULT_USER_AGENT, Accept: 'application/json' },
    })
    if (!res.ok) return null
    const body = (await res.json()) as {
      results?: Array<{ id: number; name: string }>
    }
    if (!body.results?.length) return null
    const target = normalizeGameTitle(name)
    const exact = body.results.find((it) => normalizeGameTitle(it.name) === target)
    if (exact) return exact.id
    const targetTokens = extractVersionTokens(target)
    const compatible = body.results.find((it) =>
      versionTokensMatch(targetTokens, extractVersionTokens(normalizeGameTitle(it.name))),
    )
    if (compatible) {
      log.info(
        { name, picked: compatible.name, rawgId: compatible.id },
        'rawg search picked first version-compatible hit',
      )
      return compatible.id
    }
    log.warn(
      { name, top: body.results[0]?.name },
      'rawg search had no version-compatible hit',
    )
    return null
  } catch (err) {
    log.warn({ name, err: String(err) }, 'rawg search failed')
    return null
  }
}

interface AllPagesResponse {
  query?: { allpages?: Array<{ title: string }> }
}

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

    const titles = pages.map((p) => stripMapPrefix(p.title)).filter((t): t is string => Boolean(t))
    const eligible = titles.filter((title) =>
      fandomMapTitleAcceptable(title, gameName, sub, slug),
    )
    const best = pickBestMapTitle(eligible, gameName, slug)
    if (best) {
      log.info({ sub, choice: best, candidates: titles.length }, 'fandom map discovered')
      return { subdomain: sub, mapName: best }
    }
  }
  return null
}

function stripMapPrefix(title: string): string | null {
  if (!title.startsWith(MAP_TITLE_PREFIX)) return null
  const stripped = title.slice(MAP_TITLE_PREFIX.length).trim()
  return stripped || null
}
