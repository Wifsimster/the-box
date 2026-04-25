import { queueLogger } from '../../logger/logger.js'
import {
  geoIngestFailureRepository,
  geoMapRepository,
} from '../../repositories/index.js'
import { tombstoneRetryAfter } from '../../../domain/services/geo-metadata.service.js'

const log = queueLogger.child({ worker: 'geo-fandom-import' })

// Fandom Interactive Maps are structured JSON exposed via the MediaWiki
// `getmap` action on each wiki:
//   https://<subdomain>.fandom.com/api.php?action=getmap&name=<MapPageName>
// The response includes a `backgroundImage` (URL + width + height), the
// map's `revisionId` (used for change detection on re-imports), and the
// coordinate system metadata (`origin`, `coordinateOrder`).
//
// Fandom user-generated content is published under CC-BY-SA-3.0 by default.

const DEFAULT_USER_AGENT =
  'the-box-geo-importer/1.0 (+https://github.com/Wifsimster/the-box)'
const FANDOM_DEFAULT_LICENSE = 'CC-BY-SA-3.0'

export interface ImportFandomMapInput {
  gameId: number
  wikiSubdomain: string
  // The Fandom Map: page name without the namespace prefix
  // (e.g. `Avatar_world_map`, not `Map:Avatar_world_map`).
  pageTitle: string
  userAgent?: string
}

export interface ImportFandomMapResult {
  imported: boolean
  geoMapId?: number
  reason?: string
}

interface GetMapResponse {
  backgroundImage?: {
    url?: string
    width?: number
    height?: number
  }
  mapImage?: string
  revisionId?: number
  origin?: string
  coordinateOrder?: string
}

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

  const url =
    `https://${wikiSubdomain}.fandom.com/api.php` +
    `?action=getmap&format=json&name=${encodeURIComponent(pageTitle)}`

  log.info({ gameId, wikiSubdomain, pageTitle }, 'fetching interactive map')

  let data: GetMapResponse
  try {
    data = await fetchJson<GetMapResponse>(url, ua)
  } catch (err) {
    await recordFandomTombstone(gameId, `getmap fetch failed: ${String(err)}`)
    return { imported: false, reason: 'getmap fetch failed' }
  }

  const bg = data.backgroundImage
  if (!bg?.url || !bg.width || !bg.height) {
    await recordFandomTombstone(gameId, 'getmap returned no backgroundImage')
    return { imported: false, reason: 'getmap returned no backgroundImage' }
  }

  const map = await geoMapRepository.create({
    gameId,
    source: 'fandom',
    sourceUrl: `https://${wikiSubdomain}.fandom.com/wiki/Map:${encodeURIComponent(pageTitle)}`,
    imageUrl: bg.url,
    widthPx: bg.width,
    heightPx: bg.height,
    license: FANDOM_DEFAULT_LICENSE,
    attribution: `${wikiSubdomain}.fandom.com — Map:${pageTitle}`,
    wikiMapName: pageTitle,
    wikiRevisionId: data.revisionId ?? null,
  })

  await geoIngestFailureRepository.clear(gameId, 'fandom')
  log.info({ gameId, mapId: map.id, revisionId: data.revisionId }, 'imported fandom map')
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

async function fetchJson<T>(url: string, userAgent: string): Promise<T> {
  const res = await fetch(url, {
    headers: { 'User-Agent': userAgent, Accept: 'application/json' },
  })
  if (!res.ok) {
    throw new Error(`fandom fetch failed: ${res.status} ${res.statusText}`)
  }
  return (await res.json()) as T
}
