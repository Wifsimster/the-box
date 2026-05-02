import { extractOgImage } from './geo-wand-import-logic.js'
import { geoMapRepository } from '../../repositories/geo-map.repository.js'
import { sha256OfBuffer, fetchImageBytes } from './maps-fetch-html.js'
import {
  loadSourceIdentity,
  runSourceFetch,
  type FetchOutcomeReport,
} from './maps-fetch-runtime.js'

// MapGenie publishes a landing page per game at `mapgenie.io/<slug>` whose
// og:image is the canonical world map for the game (most of the time). For
// games with multiple zones, the page also lists region links — a phase-2
// crawler could iterate those. For MVP we ingest the landing og:image and
// let the admin compare against other providers' offerings in the curation
// drawer.

const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
const MAPGENIE_LICENSE = 'MapGenie (proprietary, fair-use attribution)'

export async function runMapsFetchMapgenie(input: {
  gameId: number
  correlationId?: string
}): Promise<FetchOutcomeReport> {
  return runSourceFetch({
    gameId: input.gameId,
    source: 'mapgenie',
    attemptKind: 'map',
    correlationId: input.correlationId,
    fetch: async () => {
      const identity = await loadSourceIdentity(input.gameId)
      if (!identity?.slug) {
        return { outcome: 'not_found', errorCode: 'NO_GAME_SLUG' }
      }

      // Idempotent: if a mapgenie map already exists, advance.
      const existing = await geoMapRepository.findBySourceAndGameId(
        input.gameId,
        'mapgenie',
      )
      if (existing) {
        return { outcome: 'empty', errorCode: 'ALREADY_IMPORTED' }
      }

      const url = `https://mapgenie.io/${encodeURIComponent(identity.slug)}`
      const res = await fetch(url, {
        headers: {
          'User-Agent': DEFAULT_USER_AGENT,
          Accept: 'text/html,application/xhtml+xml',
          'Accept-Language': 'en-US,en;q=0.9',
        },
        redirect: 'follow',
      })
      if (res.status === 404) {
        return { outcome: 'not_found', httpStatus: 404 }
      }
      if (!res.ok) {
        if (res.status === 429) return { outcome: 'rate_limited', httpStatus: 429 }
        if (res.status >= 500) return { outcome: 'http_5xx', httpStatus: res.status }
        return { outcome: 'http_4xx', httpStatus: res.status }
      }

      const html = await res.text()
      const ogImage = extractOgImage(html)
      if (!ogImage) {
        return { outcome: 'parse_error', errorCode: 'NO_OG_IMAGE' }
      }

      // Pull the bytes so we can fingerprint and dimension it.
      const image = await fetchImageBytes(ogImage)
      if (!image) {
        return { outcome: 'parse_error', errorCode: 'IMAGE_FETCH_FAILED' }
      }
      const sha = sha256OfBuffer(image.bytes)

      // Cross-provider dedup: if another source already gave us the exact
      // same image, skip the insert.
      const dupe = await geoMapRepository.findByContentHash(input.gameId, sha)
      if (dupe) {
        return { outcome: 'empty', errorCode: 'DUPLICATE_CONTENT' }
      }

      await geoMapRepository.create({
        gameId: input.gameId,
        source: 'mapgenie',
        provider: 'mapgenie',
        sourceUrl: url,
        imageUrl: ogImage,
        widthPx: image.width ?? 0,
        heightPx: image.height ?? 0,
        license: MAPGENIE_LICENSE,
        attribution: 'MapGenie',
        contentSha256: sha,
        zoneName: identity.name,
        zoneSlug: identity.slug,
        isActive: false, // Awaits admin curation.
      })
      return { outcome: 'success', itemsIngested: 1 }
    },
  })
}
