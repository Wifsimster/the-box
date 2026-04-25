import { queueLogger } from '../../logger/logger.js'
import {
  geoIngestFailureRepository,
  geoMapRepository,
} from '../../repositories/index.js'
import { tombstoneRetryAfter } from '../../../domain/services/geo-metadata.service.js'

const log = queueLogger.child({ worker: 'geo-wikidata-import' })

const DEFAULT_USER_AGENT =
  'the-box-geo-importer/1.0 (+https://github.com/Wifsimster/the-box)'

// Tier 2 ingestion: when neither the curated registry nor a Fandom Interactive
// Map exist, fall back to Wikidata's `P242` (locator map image) statement on
// the game's Q-item. The image lives on Wikimedia Commons under a properly
// declared free license (CC-BY-SA / CC-0 / public domain), which is a much
// cleaner provenance than scraping a Fandom image attachment.
//
// SPARQL is overkill for one-property fetch — we use the `wbgetentities` REST
// endpoint and read claims directly.

const WIKIDATA_API = 'https://www.wikidata.org/w/api.php'
const WIKIDATA_SEARCH = 'https://www.wikidata.org/w/api.php'

export interface ImportWikidataMapInput {
  gameId: number
  // Wikidata Q-id, e.g. "Q3389581" for Elden Ring. Resolved upstream by the
  // metadata resolver and persisted to `games.wikidata_qid`.
  wikidataQid: string
}

export interface ImportWikidataMapResult {
  imported: boolean
  geoMapId?: number
  reason?: string
}

interface WbGetEntitiesResponse {
  entities?: Record<
    string,
    {
      claims?: Record<string, Array<{ mainsnak?: { datavalue?: { value?: string } } }>>
    }
  >
}

interface ImageInfoResponse {
  query?: {
    pages?: Record<
      string,
      {
        imageinfo?: Array<{
          url?: string
          width?: number
          height?: number
          extmetadata?: {
            LicenseShortName?: { value?: string }
            Artist?: { value?: string }
          }
        }>
      }
    >
  }
}

export async function importWikidataMap(
  input: ImportWikidataMapInput,
): Promise<ImportWikidataMapResult> {
  const { gameId, wikidataQid } = input

  const existing = await geoMapRepository.findActiveByGameId(gameId)
  if (existing) {
    return { imported: false, geoMapId: existing.id, reason: 'map already exists' }
  }

  log.info({ gameId, wikidataQid }, 'fetching wikidata locator map')

  let claimValue: string | null
  try {
    claimValue = await fetchP242Claim(wikidataQid)
  } catch (err) {
    await recordTombstone(gameId, `wbgetentities failed: ${String(err)}`)
    return { imported: false, reason: 'wbgetentities failed' }
  }

  if (!claimValue) {
    await recordTombstone(gameId, `no P242 claim on ${wikidataQid}`)
    return { imported: false, reason: 'no P242 claim' }
  }

  // P242 stores the Commons file name (without `File:` prefix). Resolve it
  // through Commons' imageinfo to get a real URL + dimensions + license.
  let info: { url: string; width: number; height: number; license: string; artist?: string }
  try {
    info = await fetchCommonsImageInfo(claimValue)
  } catch (err) {
    await recordTombstone(gameId, `commons imageinfo failed: ${String(err)}`)
    return { imported: false, reason: 'commons imageinfo failed' }
  }

  const map = await geoMapRepository.create({
    gameId,
    source: 'wikidata',
    sourceUrl: `https://www.wikidata.org/wiki/${wikidataQid}#P242`,
    imageUrl: info.url,
    widthPx: info.width,
    heightPx: info.height,
    license: info.license,
    attribution: info.artist
      ? `Wikimedia Commons — ${claimValue} (${info.artist})`
      : `Wikimedia Commons — ${claimValue}`,
  })

  await geoIngestFailureRepository.clear(gameId, 'wikidata')
  log.info({ gameId, mapId: map.id }, 'imported wikidata map')
  return { imported: true, geoMapId: map.id }
}

async function fetchP242Claim(qid: string): Promise<string | null> {
  const url =
    `${WIKIDATA_API}?action=wbgetentities&format=json` +
    `&props=claims&ids=${encodeURIComponent(qid)}`
  const res = await fetch(url, {
    headers: { 'User-Agent': DEFAULT_USER_AGENT, Accept: 'application/json' },
  })
  if (!res.ok) throw new Error(`status ${res.status}`)
  const body = (await res.json()) as WbGetEntitiesResponse
  const claims = body.entities?.[qid]?.claims?.P242
  const file = claims?.[0]?.mainsnak?.datavalue?.value
  return typeof file === 'string' && file.length > 0 ? file : null
}

async function fetchCommonsImageInfo(fileName: string): Promise<{
  url: string
  width: number
  height: number
  license: string
  artist?: string
}> {
  const titles = `File:${fileName}`
  const url =
    `https://commons.wikimedia.org/w/api.php?action=query&format=json&formatversion=2` +
    `&titles=${encodeURIComponent(titles)}` +
    `&prop=imageinfo&iiprop=url|size|extmetadata&iiurlwidth=4096`
  const res = await fetch(url, {
    headers: { 'User-Agent': DEFAULT_USER_AGENT, Accept: 'application/json' },
  })
  if (!res.ok) throw new Error(`status ${res.status}`)
  const body = (await res.json()) as ImageInfoResponse
  // formatversion=2 returns an array under pages; older shapes are objects —
  // normalize defensively.
  const rawPages = body.query?.pages
  const pageList = Array.isArray(rawPages) ? rawPages : Object.values(rawPages ?? {})
  const info = pageList[0]?.imageinfo?.[0]
  if (!info?.url || !info.width || !info.height) {
    throw new Error('no imageinfo')
  }
  return {
    url: info.url,
    width: info.width,
    height: info.height,
    license: info.extmetadata?.LicenseShortName?.value ?? 'unknown',
    artist: info.extmetadata?.Artist?.value,
  }
}

async function recordTombstone(gameId: number, reason: string): Promise<void> {
  const attempt =
    (await geoIngestFailureRepository.getAttemptCount(gameId, 'wikidata')) + 1
  await geoIngestFailureRepository.record({
    gameId,
    source: 'wikidata',
    reason,
    retryAfter: tombstoneRetryAfter(attempt),
  })
}

// Resolver helper: free-text search Wikidata for a Q-id matching the game name.
// Returned id is suitable for storing in `games.wikidata_qid` and feeding into
// `importWikidataMap` later.
export async function resolveWikidataQid(gameName: string): Promise<string | null> {
  const url =
    `${WIKIDATA_SEARCH}?action=wbsearchentities&format=json` +
    `&language=en&type=item&limit=5&search=${encodeURIComponent(gameName)}`
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': DEFAULT_USER_AGENT, Accept: 'application/json' },
    })
    if (!res.ok) return null
    const body = (await res.json()) as {
      search?: Array<{ id: string; description?: string }>
    }
    // Heuristic: prefer a hit whose description mentions "video game" — avoids
    // landing on a film or band of the same name.
    const list = body.search ?? []
    const gameHit =
      list.find((s) => /video game/i.test(s.description ?? '')) ?? list[0]
    return gameHit?.id ?? null
  } catch {
    return null
  }
}
