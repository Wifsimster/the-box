// Pure helpers used by the geo metadata resolver. No I/O — keeps the
// behaviour testable without a network. The resolver worker layers
// HTTP probes on top of these.

const DEFAULT_WIKI_PAGE_TITLES = [
  'Interactive_Map',
  'World_Map',
  'Map',
  'Maps',
  'Atlas',
] as const

/**
 * Derive Fandom subdomain candidates from a game slug. Most Fandom wikis
 * follow `<slug>.fandom.com`, but slugs use kebab-case while wikis are
 * usually concatenated. We yield a small ordered list of likely candidates;
 * the resolver HEAD-checks them and picks the first one that responds.
 */
export function wikiSubdomainCandidates(slug: string): string[] {
  const cleaned = slug.toLowerCase().trim()
  if (!cleaned) return []

  const collapsed = cleaned.replace(/[^a-z0-9]/g, '')
  const dashed = cleaned.replace(/[^a-z0-9-]/g, '')
  // Prefer collapsed (eldenring) over dashed (elden-ring) — Fandom convention.
  const seen = new Set<string>()
  const out: string[] = []
  for (const c of [collapsed, dashed, cleaned]) {
    if (c && !seen.has(c)) {
      seen.add(c)
      out.push(c)
    }
  }
  return out
}

export function defaultWikiPageTitles(): readonly string[] {
  return DEFAULT_WIKI_PAGE_TITLES
}

/**
 * Parse the Steam appid from a store URL, e.g.
 *   https://store.steampowered.com/app/1245620/ELDEN_RING/
 * Used when RAWG `stores[]` is available; safe to call on arbitrary strings
 * (returns null if no match).
 */
export function parseSteamAppIdFromUrl(url: string | null | undefined): number | null {
  if (!url) return null
  const m = url.match(/store\.steampowered\.com\/app\/(\d+)/i)
  if (!m) return null
  const id = Number(m[1])
  return Number.isFinite(id) && id > 0 ? id : null
}

/**
 * Very lightweight title normalization for matching Steam storesearch
 * results to a known game name — strip punctuation, lowercase, collapse
 * whitespace. Not a full fuzzy match; only used for "is this the right
 * appid" disambiguation.
 */
export function normalizeGameTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[™®]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/**
 * Compute the next retry-after timestamp for a tombstoned (game, source)
 * pair using exponential backoff capped at 30 days. Attempt 1 = 1 day,
 * attempt 2 = 2 days, attempt 3 = 4 days, …, capped at 30.
 */
export function tombstoneRetryAfter(attemptCount: number, now: Date = new Date()): Date {
  const days = Math.min(2 ** Math.max(0, attemptCount - 1), 30)
  return new Date(now.getTime() + days * 24 * 60 * 60 * 1000)
}
