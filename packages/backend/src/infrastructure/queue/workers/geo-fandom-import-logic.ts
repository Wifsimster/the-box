import { queueLogger } from '../../logger/logger.js'
import {
  geoIngestFailureRepository,
  geoMapRepository,
} from '../../repositories/index.js'
import { tombstoneRetryAfter } from '../../../domain/services/geo-metadata.service.js'

const log = queueLogger.child({ worker: 'geo-fandom-import' })

// Fandom exposes a standard MediaWiki API per wiki subdomain:
//   https://<subdomain>.fandom.com/api.php?action=query&prop=imageinfo&...
// We fetch a single page's primary image and record attribution under the
// default CC-BY-SA-3.0 license that Fandom wikis publish under.
//
// Rate-limit: a single request per call site; callers should not loop.

const DEFAULT_USER_AGENT = 'the-box-geo-importer/1.0 (+https://github.com/Wifsimster/the-box)'
const FANDOM_DEFAULT_LICENSE = 'CC-BY-SA-3.0'

export interface ImportFandomMapInput {
  gameId: number
  wikiSubdomain: string
  pageTitle: string
  userAgent?: string
}

export interface ImportFandomMapResult {
  imported: boolean
  geoMapId?: number
  reason?: string
}

interface MediaWikiImageInfo {
  url?: string
  width?: number
  height?: number
  descriptionshorturl?: string
}

interface MediaWikiPage {
  pageid?: number
  title?: string
  imageinfo?: MediaWikiImageInfo[]
  images?: Array<{ title: string }>
}

interface MediaWikiQueryResponse {
  query?: {
    pages?: Record<string, MediaWikiPage>
  }
}

/**
 * Resolve the primary image attached to a wiki page. We hit the page with
 * `prop=images` first to find image titles, then fetch `prop=imageinfo` on
 * the top candidate to get its URL + dimensions.
 */
export async function importFandomMap(
  input: ImportFandomMapInput,
): Promise<ImportFandomMapResult> {
  const { gameId, wikiSubdomain, pageTitle } = input
  const ua = input.userAgent ?? DEFAULT_USER_AGENT

  // Skip if we already have an active map for this game — do not create dupes.
  const existing = await geoMapRepository.findActiveByGameId(gameId)
  if (existing) {
    return { imported: false, geoMapId: existing.id, reason: 'map already exists' }
  }

  const base = `https://${wikiSubdomain}.fandom.com/api.php`
  const pageImagesUrl = `${base}?action=query&format=json&prop=images&titles=${encodeURIComponent(pageTitle)}&imlimit=20`

  log.info({ gameId, wikiSubdomain, pageTitle }, 'fetching page images')
  const pagesRes = await fetchJson<MediaWikiQueryResponse>(pageImagesUrl, ua)
  const page = firstPage(pagesRes)
  const imageTitle = page?.images?.find((i) => looksLikeMap(i.title))?.title ?? page?.images?.[0]?.title

  if (!imageTitle) {
    await recordFandomTombstone(gameId, 'no images on page')
    return { imported: false, reason: 'no images on page' }
  }

  const infoUrl = `${base}?action=query&format=json&prop=imageinfo&iiprop=url|size|url&titles=${encodeURIComponent(imageTitle)}`
  const infoRes = await fetchJson<MediaWikiQueryResponse>(infoUrl, ua)
  const infoPage = firstPage(infoRes)
  const info = infoPage?.imageinfo?.[0]
  if (!info?.url || !info.width || !info.height) {
    await recordFandomTombstone(gameId, 'image info missing url or dimensions')
    return { imported: false, reason: 'image info missing url or dimensions' }
  }

  const map = await geoMapRepository.create({
    gameId,
    source: 'fandom',
    sourceUrl: info.descriptionshorturl ?? `https://${wikiSubdomain}.fandom.com/wiki/${encodeURIComponent(pageTitle)}`,
    imageUrl: info.url,
    widthPx: info.width,
    heightPx: info.height,
    license: FANDOM_DEFAULT_LICENSE,
    attribution: `${wikiSubdomain}.fandom.com — ${imageTitle}`,
  })

  await geoIngestFailureRepository.clear(gameId, 'fandom')
  log.info({ gameId, mapId: map.id }, 'imported fandom map')
  return { imported: true, geoMapId: map.id }
}

async function recordFandomTombstone(gameId: number, reason: string): Promise<void> {
  const attempt = (await geoIngestFailureRepository.getAttemptCount(gameId, 'fandom')) + 1
  await geoIngestFailureRepository.record({
    gameId,
    source: 'fandom',
    reason,
    retryAfter: tombstoneRetryAfter(attempt),
  })
}

function firstPage(resp: MediaWikiQueryResponse): MediaWikiPage | undefined {
  const pages = resp.query?.pages
  if (!pages) return undefined
  return Object.values(pages)[0]
}

// Heuristic: prefer files that look like a world/region map over screenshots.
function looksLikeMap(title: string): boolean {
  const lower = title.toLowerCase()
  return lower.includes('map') || lower.includes('world') || lower.includes('atlas')
}

async function fetchJson<T>(url: string, userAgent: string): Promise<T> {
  const res = await fetch(url, { headers: { 'User-Agent': userAgent, Accept: 'application/json' } })
  if (!res.ok) {
    throw new Error(`fandom fetch failed: ${res.status} ${res.statusText}`)
  }
  return (await res.json()) as T
}
