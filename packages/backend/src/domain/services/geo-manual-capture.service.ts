import crypto from 'node:crypto'

// Curated geolocatable-capture seeding. RAWG (the automatic capture source)
// returns promotional / combat beauty-shots that usually can't be located on a
// map. This service turns an operator-supplied list of KNOWN-geolocatable
// capture URLs into `source='manual'` candidate rows — the reliable path to
// captures a proposer can actually pin. Pure helpers (no I/O) so they stay
// testable; the async seeder in the worker layer feeds these into the existing
// geoScreenshotRepository.createCandidate path.

export interface ManualCaptureCandidate {
  imageUrl: string
  source: 'manual'
  externalId: string
}

// Accept common raster image extensions. The extension may sit at the end of
// the path OR be followed by a further path segment — Fandom/Wikia CDN URLs
// look like `…/Central_Yharnam.jpg/revision/latest`. Query strings/fragments
// (`?cb=…`) live outside the pathname and don't affect the match.
const IMAGE_PATH = /\.(png|jpe?g|webp|gif|bmp)(\/|$)/i

/**
 * A curated capture URL is valid iff it is an absolute http(s) URL whose path
 * ends in a known raster image extension. Deliberately strict — a bad URL
 * should be dropped at seed time, not surface as a broken candidate later.
 */
export function isValidCaptureUrl(url: string): boolean {
  let parsed: URL
  try {
    parsed = new URL(url.trim())
  } catch {
    return false
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false
  return IMAGE_PATH.test(parsed.pathname)
}

/**
 * Deterministic dedup key for a manual capture: `manual:` + sha256 of the
 * trimmed URL (truncated). Reused as the candidate's `external_id`, so the
 * (source, external_id) unique index makes re-seeding idempotent.
 */
export function manualCaptureExternalId(url: string): string {
  const hash = crypto.createHash('sha256').update(url.trim()).digest('hex')
  return `manual:${hash.slice(0, 32)}`
}

/**
 * Turn curated capture URLs into candidate inputs: drop invalid URLs, collapse
 * duplicates (by normalized URL), and stamp a stable external id on each. The
 * caller pairs the result with a game id + geo map id and inserts via
 * createCandidate.
 */
export function buildManualCaptureCandidates(
  urls: readonly string[],
): ManualCaptureCandidate[] {
  const seen = new Set<string>()
  const out: ManualCaptureCandidate[] = []
  for (const raw of urls) {
    const url = raw.trim()
    if (!isValidCaptureUrl(url)) continue
    const externalId = manualCaptureExternalId(url)
    if (seen.has(externalId)) continue
    seen.add(externalId)
    out.push({ imageUrl: url, source: 'manual', externalId })
  }
  return out
}
