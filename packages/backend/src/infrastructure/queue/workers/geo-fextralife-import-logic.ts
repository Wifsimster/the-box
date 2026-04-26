import { queueLogger } from '../../logger/logger.js'
import {
  geoIngestFailureRepository,
  geoMapRepository,
} from '../../repositories/index.js'
import { tombstoneRetryAfter } from '../../../domain/services/geo-metadata.service.js'
import { probeImageDimensions } from './image-dimensions.js'

const log = queueLogger.child({ worker: 'geo-fextralife-import' })

// Fextralife (https://*.wiki.fextralife.com) hosts the highest-quality
// Soulsborne / RPG world maps on the open web — Elden Ring, BG3,
// Bloodborne, Dark Souls, Divinity OS 1+2, Hogwarts Legacy. Pages follow a
// stable slug and expose an `og:image` poster meant for social embedding,
// which is what we ingest. We deliberately don't stitch their Leaflet
// tiles (terms-of-service ambiguity); the og:image is enough to drive a
// guess-the-location experience.
//
// Strategy:
//   1. Derive a subdomain from the game slug/name.
//   2. HEAD-probe `/Interactive+Map`, `/World+Map`, `/Map` in order.
//   3. GET the first 200 path; extract `og:image`.
//   4. Probe the og:image to fill width/height; insert geo_map row.

const DEFAULT_USER_AGENT =
  'the-box-geo-importer/1.0 (+https://github.com/Wifsimster/the-box)'
const FEXTRALIFE_LICENSE = 'Fextralife (fair use, attribution)'
const PATH_CANDIDATES = ['Interactive+Map', 'World+Map', 'Map']
const MIN_DIMENSION = 600

export interface ImportFextralifeMapInput {
  gameId: number
  gameName: string
  slug: string
  userAgent?: string
}

export interface ImportFextralifeMapResult {
  imported: boolean
  geoMapId?: number
  reason?: string
}

export async function importFextralifeMap(
  input: ImportFextralifeMapInput,
): Promise<ImportFextralifeMapResult> {
  const { gameId, gameName, slug } = input
  const ua = input.userAgent ?? DEFAULT_USER_AGENT

  const existing = await geoMapRepository.findBySourceAndGameId(gameId, 'fextralife')
  if (existing) {
    return {
      imported: false,
      geoMapId: existing.id,
      reason: 'fextralife map already imported',
    }
  }

  const subdomains = fextralifeSubdomainCandidates(gameName, slug)
  log.info({ gameId, subdomains }, 'probing fextralife')

  let hit: { subdomain: string; pagePath: string; html: string } | null = null
  for (const sub of subdomains) {
    const found = await probeSubdomain(sub, ua)
    if (found) {
      hit = found
      break
    }
  }
  if (!hit) {
    await tombstone(gameId, 'no fextralife wiki / map page found')
    return { imported: false, reason: 'no map page' }
  }

  const ogImage = extractOgImage(hit.html)
  if (!ogImage) {
    await tombstone(gameId, `og:image missing on ${hit.subdomain}/${hit.pagePath}`)
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

  const sourceUrl = `https://${hit.subdomain}.wiki.fextralife.com/${hit.pagePath}`
  const map = await geoMapRepository.create({
    gameId,
    source: 'fextralife',
    sourceUrl,
    imageUrl: ogImage,
    widthPx: dims.width,
    heightPx: dims.height,
    license: FEXTRALIFE_LICENSE,
    attribution: `Map © ${hit.subdomain}.wiki.fextralife.com`,
  })

  await geoIngestFailureRepository.clear(gameId, 'fextralife')
  log.info(
    { gameId, mapId: map.id, sub: hit.subdomain, ogImage, dims },
    'imported fextralife map',
  )
  return { imported: true, geoMapId: map.id }
}

/**
 * Derive Fextralife wiki subdomain candidates from a game's name + slug.
 * The site's convention is alphanumeric-only (no separators): "Elden Ring"
 * → `eldenring`, "Baldur's Gate III" → `baldursgate3`. Roman numerals are
 * expanded to arabic to match the way Fextralife actually registers wikis.
 */
export function fextralifeSubdomainCandidates(
  gameName: string,
  slug: string,
): string[] {
  const out = new Set<string>()
  const base = romanToArabic(gameName)
  const compact = base.toLowerCase().replace(/[^a-z0-9]+/g, '')
  if (compact) out.add(compact)
  const compactFromSlug = slug.toLowerCase().replace(/[^a-z0-9]+/g, '')
  if (compactFromSlug) out.add(compactFromSlug)
  // Drop a leading "the" — "thewitcher3" ≠ "witcher3" on Fextralife.
  if (compact.startsWith('the')) out.add(compact.slice(3))
  if (compactFromSlug.startsWith('the')) out.add(compactFromSlug.slice(3))
  return [...out]
}

// Conservative whitelist of roman numerals 1..20. A general-purpose roman
// regex matches too many in-word substrings ("DIVINITY" contains "DIVI",
// "LIVE" contains "LIV") so we hard-code the values we actually see in
// game titles ("Baldur's Gate III", "Diablo II", "GTA IV").
const ROMAN_NUMERALS: Record<string, string> = {
  I: '1', II: '2', III: '3', IV: '4', V: '5', VI: '6', VII: '7', VIII: '8',
  IX: '9', X: '10', XI: '11', XII: '12', XIII: '13', XIV: '14', XV: '15',
  XVI: '16', XVII: '17', XVIII: '18', XIX: '19', XX: '20',
}

function romanToArabic(s: string): string {
  return s.replace(/\b([IVX]{1,5})\b/g, (m) => ROMAN_NUMERALS[m.toUpperCase()] ?? m)
}

async function probeSubdomain(
  subdomain: string,
  ua: string,
): Promise<{ subdomain: string; pagePath: string; html: string } | null> {
  for (const path of PATH_CANDIDATES) {
    const url = `https://${subdomain}.wiki.fextralife.com/${path}`
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': ua, Accept: 'text/html' },
      })
      if (!res.ok) continue
      const text = await res.text()
      // Fextralife sometimes serves a soft-404 page with a 200 status; gate
      // on the page actually advertising itself as a map.
      if (!/og:image/i.test(text)) continue
      return { subdomain, pagePath: path, html: text }
    } catch {
      // Network error — try the next candidate path.
    }
  }
  return null
}

// Match `<meta>` regardless of attribute order: `property` and `content` may
// appear in either sequence depending on the CMS.
const OG_IMAGE_FORWARD =
  /<meta[^>]+property=["']og:image(?::secure_url|:url)?["'][^>]+content=["']([^"']+)["']/i
const OG_IMAGE_REVERSE =
  /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image(?::secure_url|:url)?["']/i

export function extractOgImage(html: string): string | null {
  const m = html.match(OG_IMAGE_FORWARD) ?? html.match(OG_IMAGE_REVERSE)
  if (!m) return null
  const raw = m[1]?.trim()
  if (!raw) return null
  // Reject relative paths (Fextralife always returns absolute URLs but be
  // defensive — a relative URL would point at the wrong host).
  if (!/^https?:\/\//i.test(raw)) return null
  return raw
}

async function tombstone(gameId: number, reason: string): Promise<void> {
  const attempt =
    (await geoIngestFailureRepository.getAttemptCount(gameId, 'fextralife')) + 1
  await geoIngestFailureRepository.record({
    gameId,
    source: 'fextralife',
    reason,
    retryAfter: tombstoneRetryAfter(attempt),
  })
}
