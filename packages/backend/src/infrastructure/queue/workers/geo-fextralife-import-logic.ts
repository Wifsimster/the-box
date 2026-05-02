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
//   3. GET the first 200 path; this is the "index page".
//   4. Scan the index HTML for per-region map links (e.g. BG3 has
//      `/Nautiloid+Map`, `/Wilderness+Map`, `/Shadow-Cursed+Lands+Map`,
//      `/Baldurs+Gate+Map`). For each, GET, extract og:image, probe dims,
//      insert a geo_map row tagged with the region name.
//   5. If no per-region links exist (Elden Ring-style single-world wiki),
//      fall back to importing the index page's own og:image as the sole map.

const DEFAULT_USER_AGENT =
  'the-box-geo-importer/1.0 (+https://github.com/Wifsimster/the-box)'
const FEXTRALIFE_LICENSE = 'Fextralife (fair use, attribution)'
const PATH_CANDIDATES = ['Interactive+Map', 'World+Map', 'Map']
const MIN_DIMENSION = 600
// Hard cap so a malformed wiki that links to hundreds of `*+Map` pages
// can't fan out into a runaway scrape.
const MAX_PAGES_PER_GAME = 30

export interface ImportFextralifeMapInput {
  gameId: number
  gameName: string
  slug: string
  userAgent?: string
}

export interface ImportFextralifeMapResult {
  imported: boolean
  // Count of newly inserted geo_map rows (0 when everything was already
  // imported or the wiki has no map page).
  insertedCount?: number
  // Backwards-compat: id of *one* of the inserted rows (the first), used
  // by older callers that only cared about a single map.
  geoMapId?: number
  reason?: string
}

export async function importFextralifeMap(
  input: ImportFextralifeMapInput,
): Promise<ImportFextralifeMapResult> {
  const { gameId, gameName, slug } = input
  const ua = input.userAgent ?? DEFAULT_USER_AGENT

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

  const baseUrl = `https://${hit.subdomain}.wiki.fextralife.com`
  const indexPath = hit.pagePath
  const regionPaths = discoverRegionMapPaths(hit.html, hit.subdomain).filter(
    (p) => normalizePagePath(p) !== normalizePagePath(indexPath),
  )

  // BG3-style wiki: index links to per-region map pages → import each region
  // and skip the index's generic banner og:image. Elden-Ring-style wiki:
  // index has no children → fall back to the single index og:image.
  type Page = { path: string; html: string; region: string | null }
  const pages: Page[] = []
  if (regionPaths.length > 0) {
    const capped = regionPaths.slice(0, MAX_PAGES_PER_GAME)
    for (const path of capped) {
      const html = await fetchPage(`${baseUrl}/${path}`, ua)
      if (!html) continue
      pages.push({ path, html, region: regionFromPath(path) })
    }
  }
  if (pages.length === 0) {
    // Single-world fallback (current behavior).
    pages.push({ path: indexPath, html: hit.html, region: null })
  }

  let insertedCount = 0
  let firstInsertedId: number | undefined
  const skippedReasons: string[] = []

  for (const page of pages) {
    const sourceUrl = `${baseUrl}/${page.path}`
    const existing = await geoMapRepository.findBySourceUrl(gameId, sourceUrl)
    if (existing) {
      skippedReasons.push(`already imported: ${page.path}`)
      continue
    }
    const ogImage = extractOgImage(page.html)
    if (!ogImage) {
      skippedReasons.push(`og:image missing on ${page.path}`)
      continue
    }
    const dims = await probeImageDimensions(ogImage, ua)
    if (!dims) {
      skippedReasons.push(`could not probe dimensions for ${page.path}`)
      continue
    }
    if (dims.width < MIN_DIMENSION || dims.height < MIN_DIMENSION) {
      skippedReasons.push(
        `og:image too small (${dims.width}x${dims.height}) on ${page.path}`,
      )
      continue
    }

    const map = await geoMapRepository.create({
      gameId,
      source: 'fextralife',
      sourceUrl,
      imageUrl: ogImage,
      widthPx: dims.width,
      heightPx: dims.height,
      license: FEXTRALIFE_LICENSE,
      attribution: `Map © ${hit.subdomain}.wiki.fextralife.com`,
      region: page.region,
    })
    insertedCount += 1
    if (firstInsertedId === undefined) firstInsertedId = map.id
    log.info(
      {
        gameId,
        mapId: map.id,
        sub: hit.subdomain,
        path: page.path,
        region: page.region,
        ogImage,
        dims,
      },
      'imported fextralife map',
    )
  }

  // Cleanup: when this run produced ≥1 per-region row, drop any
  // pre-existing generic-index row (`…/Interactive+Map`, `…/World+Map`,
  // `…/Map`) for the same game. That row's og:image was the wiki's banner,
  // never a usable region map. Guarded on `regionPaths.length > 0` so the
  // Elden-Ring-style single-map fallback never deletes its only candidate.
  let prunedIndexRows = 0
  if (insertedCount > 0 && regionPaths.length > 0) {
    prunedIndexRows = await pruneGenericIndexRows(gameId, baseUrl)
    if (prunedIndexRows > 0) {
      log.info({ gameId, prunedIndexRows }, 'pruned generic fextralife index row(s)')
    }
  }

  if (insertedCount === 0) {
    // Don't tombstone if it's purely an idempotent re-run (everything
    // already imported); only tombstone when we couldn't extract anything.
    const allAlreadyImported = skippedReasons.every((r) =>
      r.startsWith('already imported'),
    )
    if (!allAlreadyImported) {
      await tombstone(
        gameId,
        skippedReasons[0] ?? 'no usable fextralife map pages',
      )
    }
    return {
      imported: false,
      insertedCount: 0,
      reason: allAlreadyImported
        ? 'fextralife maps already imported'
        : (skippedReasons[0] ?? 'no usable fextralife map pages'),
    }
  }

  await geoIngestFailureRepository.clear(gameId, 'fextralife')
  return { imported: true, insertedCount, geoMapId: firstInsertedId }
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

async function fetchPage(url: string, ua: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': ua, Accept: 'text/html' },
    })
    if (!res.ok) return null
    return await res.text()
  } catch {
    return null
  }
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

/**
 * Scan an index page's HTML for anchors that look like per-region map
 * pages on the same wiki. Returns the page paths (no leading slash, no
 * subdomain). De-duplicated, order preserved by first appearance.
 *
 * Heuristic: hrefs whose path segment ends in `+Map` (Fextralife's
 * convention for `Foo+Map`, `Foo+Bar+Map`, etc.). Excludes off-wiki links
 * and forum/comment fragments.
 */
export function discoverRegionMapPaths(html: string, subdomain: string): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  // Consider both relative (`href="/Foo+Map"`) and absolute URLs that
  // point at the same wiki subdomain.
  const anchorRe = /<a\b[^>]*\bhref=["']([^"']+)["'][^>]*>/gi
  let m: RegExpExecArray | null
  while ((m = anchorRe.exec(html)) !== null) {
    const raw = m[1]
    if (!raw) continue
    const path = extractWikiPath(raw, subdomain)
    if (!path) continue
    if (!/\+Map$/i.test(path)) continue
    const norm = normalizePagePath(path)
    if (seen.has(norm)) continue
    seen.add(norm)
    out.push(path)
  }
  return out
}

// Returns the wiki-relative page path (no leading slash, no query/fragment)
// if the href points at the same subdomain, else null.
function extractWikiPath(href: string, subdomain: string): string | null {
  let raw = href.trim()
  if (!raw || raw.startsWith('#') || raw.startsWith('mailto:')) return null
  // Strip query/fragment.
  raw = raw.split(/[?#]/)[0]!
  if (!raw) return null
  if (raw.startsWith('//')) raw = `https:${raw}`
  if (/^https?:\/\//i.test(raw)) {
    try {
      const u = new URL(raw)
      if (u.hostname !== `${subdomain}.wiki.fextralife.com`) return null
      return decodeURI(u.pathname.replace(/^\/+/, ''))
    } catch {
      return null
    }
  }
  // Relative href: keep only on-wiki paths (skip protocol-relative we already
  // handled, and links to anchors / external schemes already filtered).
  return decodeURI(raw.replace(/^\/+/, ''))
}

function normalizePagePath(path: string): string {
  return path.toLowerCase().replace(/\/+$/, '')
}

/**
 * Convert a wiki page path (e.g. `Shadow-Cursed+Lands+Map`) to a
 * human-readable region label (`Shadow-Cursed Lands`). Drops the trailing
 * `Map` token. Returns null if the path collapses to an empty string
 * (which shouldn't happen for matched paths but keeps callers safe).
 */
export function regionFromPath(path: string): string | null {
  // `+` is Fextralife's word separator; `_` shows up occasionally too.
  let label = path.replace(/[+_]/g, ' ').trim()
  // Drop the trailing "Map" token (case-insensitive).
  label = label.replace(/\s+map$/i, '').trim()
  if (!label) return null
  return label
}

async function pruneGenericIndexRows(
  gameId: number,
  baseUrl: string,
): Promise<number> {
  const indexUrls = PATH_CANDIDATES.map((p) => `${baseUrl}/${p}`)
  let deleted = 0
  for (const url of indexUrls) {
    const existing = await geoMapRepository.findBySourceUrl(gameId, url)
    if (!existing) continue
    const ok = await geoMapRepository.deleteById(existing.id)
    if (ok) deleted += 1
  }
  return deleted
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
