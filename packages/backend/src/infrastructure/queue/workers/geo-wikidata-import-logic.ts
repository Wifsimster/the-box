import { queueLogger } from '../../logger/logger.js'
import {
  geoIngestFailureRepository,
  geoMapRepository,
} from '../../repositories/index.js'
import { tombstoneRetryAfter } from '../../../domain/services/geo-metadata.service.js'

const log = queueLogger.child({ worker: 'geo-wikidata-import' })

const DEFAULT_USER_AGENT =
  'the-box-geo-importer/1.0 (+https://github.com/Wifsimster/the-box)'

const WIKIDATA_API = 'https://www.wikidata.org/w/api.php'
const WIKIDATA_SEARCH = 'https://www.wikidata.org/w/api.php'

export interface ImportWikidataMapInput {
  gameId: number
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
        title?: string
        categories?: Array<{ title?: string }>
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

const REAL_WORLD_CATEGORY_RE =
  /(locator map|locator maps|maps of [a-z]|maps of the [a-z]|location maps|country maps|geographic maps|real-?world maps|administrative divisions)/i
const REAL_WORLD_FILENAME_RE =
  /(locator|location_map|country_map|world_political|earth_political|continent_of_)/i

export async function importWikidataMap(
  input: ImportWikidataMapInput,
): Promise<ImportWikidataMapResult> {
  const { gameId, wikidataQid } = input

  const existing = await geoMapRepository.findBySourceAndGameId(gameId, 'wikidata')
  if (existing) {
    return {
      imported: false,
      geoMapId: existing.id,
      reason: 'wikidata map already imported',
    }
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

  let info: {
    url: string
    width: number
    height: number
    license: string
    artist?: string
    categories: string[]
  }
  try {
    info = await fetchCommonsImageInfo(claimValue)
  } catch (err) {
    await recordTombstone(gameId, `commons imageinfo failed: ${String(err)}`)
    return { imported: false, reason: 'commons imageinfo failed' }
  }

  const categoryHit = info.categories.find((c) => REAL_WORLD_CATEGORY_RE.test(c))
  if (categoryHit) {
    await recordTombstone(
      gameId,
      `P242 is a real-world map (Commons category: ${categoryHit}) — rejected`,
    )
    return { imported: false, reason: 'real-world locator map' }
  }
  if (REAL_WORLD_FILENAME_RE.test(claimValue)) {
    await recordTombstone(
      gameId,
      `P242 filename "${claimValue}" looks like a real-world locator map — rejected`,
    )
    return { imported: false, reason: 'real-world locator map' }
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
  categories: string[]
}> {
  const titles = `File:${fileName}`
  const url =
    `https://commons.wikimedia.org/w/api.php?action=query&format=json&formatversion=2` +
    `&titles=${encodeURIComponent(titles)}` +
    `&prop=imageinfo|categories&cllimit=50&clshow=!hidden` +
    `&iiprop=url|size|extmetadata&iiurlwidth=4096`
  const res = await fetch(url, {
    headers: { 'User-Agent': DEFAULT_USER_AGENT, Accept: 'application/json' },
  })
  if (!res.ok) throw new Error(`status ${res.status}`)
  const body = (await res.json()) as ImageInfoResponse
  const rawPages = body.query?.pages
  type PageEntry = NonNullable<NonNullable<ImageInfoResponse['query']>['pages']>[string]
  const pageList: PageEntry[] = Array.isArray(rawPages)
    ? (rawPages as PageEntry[])
    : Object.values<PageEntry>(rawPages ?? {})
  const page = pageList[0]
  const info = page?.imageinfo?.[0]
  if (!info?.url || !info.width || !info.height) {
    throw new Error('no imageinfo')
  }
  const categories = (page?.categories ?? [])
    .map((c) => (c.title ?? '').replace(/^Category:/, ''))
    .filter((t) => t.length > 0)
  return {
    url: info.url,
    width: info.width,
    height: info.height,
    license: info.extmetadata?.LicenseShortName?.value ?? 'unknown',
    artist: info.extmetadata?.Artist?.value,
    categories,
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
    const list = body.search ?? []
    const gameHit =
      list.find((s) => /video game/i.test(s.description ?? '')) ?? list[0]
    return gameHit?.id ?? null
  } catch {
    return null
  }
}
