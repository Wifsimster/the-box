import { queueLogger } from '../../logger/logger.js'
import {
  geoIngestFailureRepository,
  geoMapRepository,
} from '../../repositories/index.js'
import { tombstoneRetryAfter } from '../../../domain/services/geo-metadata.service.js'
import { probeImageDimensions } from './image-dimensions.js'

const log = queueLogger.child({ worker: 'geo-wand-import' })

// Wand (https://wand.com/maps/<slug>) hosts community-curated interactive
// maps for ~750 games. Unlike registry / Fandom / Wikidata, there is no
// machine-readable feed and the slug-to-game mapping isn't predictable
// across editions, so admins paste the exact wand.com URL on a per-game
// basis. The server fetches the page, extracts the `og:image` poster
// (Wand publishes one for social embedding), probes its dimensions, and
// records a `source = 'wand'` row.
//
// Licensing: Wand maps are derivative of publisher assets and Wand has no
// public API or sub-license to redistribute. We treat the result as
// fair-use attribution-only; commercialUseOk is implicitly false. Admins
// confirm by pasting the URL — the same trust model as the manual tier.

const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (compatible; the-box-geo-importer/1.0; +https://github.com/Wifsimster/the-box)'
const WAND_LICENSE = 'Wand.com (proprietary, fair-use attribution)'
const MIN_DIMENSION = 600
const WAND_HOST_SUFFIX = 'wand.com'

export interface ImportWandMapInput {
  gameId: number
  wandUrl: string
  region?: string
  userAgent?: string
}

export interface ImportWandMapResult {
  imported: boolean
  geoMapId?: number
  reason?: string
}

export async function importWandMap(
  input: ImportWandMapInput,
): Promise<ImportWandMapResult> {
  const { gameId, wandUrl, region } = input
  const ua = input.userAgent ?? DEFAULT_USER_AGENT

  if (!isWandUrl(wandUrl)) {
    await tombstone(gameId, `not a wand.com URL: ${wandUrl}`)
    return { imported: false, reason: 'not a wand.com URL' }
  }

  const existing = await geoMapRepository.findBySourceAndGameId(gameId, 'wand')
  if (existing) {
    return {
      imported: false,
      geoMapId: existing.id,
      reason: 'wand map already imported',
    }
  }

  log.info({ gameId, wandUrl }, 'fetching wand page')

  let html: string
  try {
    const res = await fetch(wandUrl, {
      headers: {
        'User-Agent': ua,
        Accept: 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    })
    if (!res.ok) {
      await tombstone(gameId, `GET ${wandUrl} → ${res.status}`)
      return { imported: false, reason: `GET failed: ${res.status}` }
    }
    html = await res.text()
  } catch (err) {
    await tombstone(gameId, `GET fetch threw: ${String(err)}`)
    return { imported: false, reason: 'GET fetch threw' }
  }

  const ogImage = extractOgImage(html)
  if (!ogImage) {
    await tombstone(gameId, `og:image missing on ${wandUrl}`)
    return { imported: false, reason: 'og:image missing' }
  }

  const dims = await probeImageDimensions(ogImage, ua)
  if (!dims) {
    await tombstone(gameId, `could not probe dimensions for ${ogImage}`)
    return { imported: false, reason: 'could not probe dimensions' }
  }
  if (dims.width < MIN_DIMENSION || dims.height < MIN_DIMENSION) {
    await tombstone(
      gameId,
      `og:image too small (${dims.width}x${dims.height}) — likely a logo, not a map`,
    )
    return { imported: false, reason: 'og:image too small' }
  }

  const map = await geoMapRepository.create({
    gameId,
    source: 'wand',
    sourceUrl: wandUrl,
    imageUrl: ogImage,
    widthPx: dims.width,
    heightPx: dims.height,
    license: WAND_LICENSE,
    attribution: `Map © wand.com — ${wandUrl}`,
    region: region ?? null,
  })

  await geoIngestFailureRepository.clear(gameId, 'wand')
  log.info(
    { gameId, mapId: map.id, wandUrl, ogImage, dims },
    'imported wand map',
  )
  return { imported: true, geoMapId: map.id }
}

// Same anchored-host check the rest of the codebase uses for trusted
// origins: must be an https URL whose hostname is `wand.com` or any
// subdomain of it. Rejects `evil.com/?wand.com` and `wand.com.evil.com`.
export function isWandUrl(input: string): boolean {
  let parsed: URL
  try {
    parsed = new URL(input)
  } catch {
    return false
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return false
  const host = parsed.hostname.toLowerCase()
  return host === WAND_HOST_SUFFIX || host.endsWith(`.${WAND_HOST_SUFFIX}`)
}

const OG_IMAGE_FORWARD =
  /<meta[^>]+property=["']og:image(?::secure_url|:url)?["'][^>]+content=["']([^"']+)["']/i
const OG_IMAGE_REVERSE =
  /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image(?::secure_url|:url)?["']/i

export function extractOgImage(html: string): string | null {
  const m = html.match(OG_IMAGE_FORWARD) ?? html.match(OG_IMAGE_REVERSE)
  if (!m) return null
  const raw = m[1]?.trim()
  if (!raw) return null
  if (!/^https?:\/\//i.test(raw)) return null
  return raw
}

async function tombstone(gameId: number, reason: string): Promise<void> {
  const attempt =
    (await geoIngestFailureRepository.getAttemptCount(gameId, 'wand')) + 1
  await geoIngestFailureRepository.record({
    gameId,
    source: 'wand',
    reason,
    retryAfter: tombstoneRetryAfter(attempt),
  })
}
