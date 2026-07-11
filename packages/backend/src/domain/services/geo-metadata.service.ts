// Pure helpers used by the geo metadata resolver. No I/O — keeps the
// behaviour testable without a network. The resolver worker layers
// HTTP probes on top of these.

// Fandom Interactive Maps live in namespace 2900 (`Map:`) on every wiki
// that has the feature enabled. The resolver discovers maps by listing
// pages in this namespace via `?action=query&list=allpages&apnamespace=2900`.
export const FANDOM_MAP_NAMESPACE = 2900

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

/**
 * Score a `Map:` page title against the curated game's name + slug to pick
 * the most likely "main" map when a wiki publishes several. Higher is
 * better. The scoring rewards titles that:
 *   - mention the full game name (strongest signal of the canonical map),
 *   - mention slug tokens (game-specific sub-maps still beat generic ones),
 *   - mention top-level keywords (`world`, `overworld`, `atlas`, `main`,
 *     `full`, `complete`, `central`, `overview`),
 *   - mention "map" generically.
 *
 * It penalises titles that:
 *   - are degenerate (e.g. just "Map", "Maps", or a single word),
 *   - look like sub-region / DLC / interior maps,
 *   - look like serialised episodes (`Act I`, `Chapter 2`, `Part 3`) — those
 *     are usually one of N installments and never the canonical world map.
 *
 * Pure function so the resolver can be exercised without network access.
 */
export function scoreMapTitle(
  mapTitle: string,
  gameName: string,
  slug: string,
): number {
  const t = mapTitle.toLowerCase().replace(/_/g, ' ').trim()
  const name = normalizeGameTitle(gameName)
  const slugTokens = slug
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((tok) => tok.length >= 3)

  let score = 0
  if (name && t.includes(name)) score += 50
  // Extra boost when the title *equals* the game name (e.g. "Elden Ring"
  // beats "Elden Ring Boss Map"). Cheap signal for canonical pages.
  if (name && t === name) score += 30
  for (const tok of slugTokens) {
    if (t.includes(tok)) score += 8
  }
  if (/\b(world|overworld|atlas|main|full|complete|central|overview)\b/.test(t))
    score += 20
  if (/\bmap\b/.test(t)) score += 5
  // Penalise obvious sub-region or DLC maps when a top-level alternative exists.
  if (/\b(zone|region|area|level|dlc|dungeon|interior|building|biome|district|chapter|episode|part|act|mission|quest)\b/.test(t))
    score -= 8
  // Roman / arabic numerals at end → "Act I", "Map 2", "Chapter III" etc.
  if (/\b(?:[ivx]+|\d+)$/.test(t)) score -= 8
  // Degenerate titles: empty, single word, or just "map"/"maps".
  const tokens = t.split(/\s+/).filter(Boolean)
  if (tokens.length <= 1) score -= 15
  if (t === 'map' || t === 'maps') score -= 30
  return score
}

// ---------------------------------------------------------------------------
// Franchise-wiki disambiguation — prevents wrong-game map assignment.
//
// A Fandom subdomain is either game-specific (`bloodborne`, `eldenring` — every
// Map: page belongs to that one game) or franchise-scoped (`uncharted`, `zelda`
// — the Map: namespace mixes maps from many installments). On a game-specific
// wiki a generically-titled map ("World Map") is safe to accept. On a franchise
// wiki it is NOT: a game with no map of its own would otherwise be assigned a
// sibling installment's map — the observed bug where "Uncharted 2: Among
// Thieves" got Lost Legacy's "Western Ghats" and "Ocarina of Time" got the 1986
// "Level 1" dungeon map.
// ---------------------------------------------------------------------------

// Subdomain tokens that carry no game identity (platform/lang/site suffixes).
const WIKI_STOPWORDS = new Set([
  'gamepedia', 'fandom', 'wiki', 'wikia', 'en', 'community', 'the',
])

/**
 * Reduce a Fandom subdomain to its identity tokens, dropping platform/lang
 * suffixes: `zelda_gamepedia_en` → `['zelda']`, `uncharted` → `['uncharted']`,
 * `eldenring` → `['eldenring']`. Pure helper for franchise detection.
 */
export function fandomWikiBaseTokens(subdomain: string): string[] {
  return subdomain
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((tok) => tok.length > 0 && !WIKI_STOPWORDS.has(tok))
}

/**
 * True when the wiki spans more than one game (franchise wiki), inferred from
 * the subdomain being materially shorter than the game's collapsed slug. On a
 * game-specific wiki the collapsed slug equals the base (`bloodborne` ==
 * `bloodborne`, `eldenring` == `eldenring`); on a franchise wiki the slug
 * carries installment tokens the subdomain omits (`uncharted` vs
 * `uncharted2amongthieves`, `zelda` vs `thelegendofzeldaocarinaoftime`).
 */
export function isFranchiseWiki(subdomain: string, slug: string): boolean {
  const collapsed = slug.toLowerCase().replace(/[^a-z0-9]/g, '')
  const base = fandomWikiBaseTokens(subdomain).join('')
  if (!base || !collapsed) return false
  if (collapsed === base) return false
  // Slug materially longer than the wiki base → the wiki name omits the
  // installment-identifying tokens, i.e. it covers the whole franchise.
  //
  // Limitation: the fixed +3 margin misses franchises whose slug barely exceeds
  // the base (e.g. `baldursgateiii` vs a `baldursgate` wiki). Those fall back to
  // single-game handling — a conservative miss (may still accept a sibling map),
  // never a false franchise flag. Widen deliberately if such a case surfaces.
  return collapsed.length > base.length + 3
}

/**
 * Decide whether a Map: title may be auto-assigned to a game. On a
 * game-specific wiki there is nothing to disambiguate (always true). On a
 * franchise wiki, only accept a title that unambiguously names THIS game — the
 * full normalized game name must appear in the title. Deliberately strict: a
 * false negative (no map) is recoverable via other import tiers or manual
 * assignment, whereas a false positive feeds another game's map into the
 * consensus pipeline.
 */
export function fandomMapTitleAcceptable(
  mapTitle: string,
  gameName: string,
  subdomain: string,
  slug: string,
): boolean {
  if (!isFranchiseWiki(subdomain, slug)) return true
  const title = normalizeGameTitle(mapTitle.replace(/_/g, ' '))
  const name = normalizeGameTitle(gameName)
  return name.length > 0 && title.includes(name)
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

const ROMAN_NUMERAL_TOKENS = new Set<string>([
  'i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii', 'ix', 'x',
  'xi', 'xii', 'xiii', 'xiv', 'xv', 'xvi', 'xvii', 'xviii', 'xix', 'xx',
])

/**
 * Pull the version-like tokens from a normalized title. We treat both arabic
 * numerals (`2`, `3`) and roman numerals (`ii`, `iii`) as version markers
 * because Steam's storesearch returns sequels alongside the original entry —
 * "Baldur's Gate II: Enhanced Edition" must not silently bind to a curated
 * "Baldur's Gate" row just because it ranks first in the API response.
 *
 * Pure helper so the resolver stays testable without hitting Steam.
 */
export function extractVersionTokens(normalized: string): string[] {
  return normalized
    .split(/\s+/)
    .filter((tok) => /^\d+$/.test(tok) || ROMAN_NUMERAL_TOKENS.has(tok))
}

/**
 * True iff two version-token lists describe the same installment. The order
 * doesn't matter ("part 2" vs "2 part") but the multiset must match — so
 * "baldur s gate" (no tokens) only matches candidates that also have no
 * version tokens, and "baldur s gate 3" only matches candidates whose
 * tokens are exactly `["3"]`.
 */
export function versionTokensMatch(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false
  const sortedA = [...a].sort()
  const sortedB = [...b].sort()
  return sortedA.every((tok, i) => tok === sortedB[i])
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

// Genre-based heuristic for "is this game even capable of having a world map?".
// RAWG genre names — kept conservative on the negative list because false
// negatives hide playable games from the curate UI, while false positives
// just waste a few API calls before tombstoning.
const NO_MAP_GENRES = new Set<string>([
  'Puzzle',
  'Platformer',
  'Racing',
  'Sports',
  'Fighting',
  'Card',
  'Board Games',
  'Educational',
  'Casual',
  'Family',
  'Arcade',
])

const HAS_MAP_GENRES = new Set<string>([
  'Adventure',
  'RPG',
  'Massively Multiplayer',
])

/**
 * Returns:
 *   - true  → genres strongly suggest a navigable world map exists
 *             (Adventure/RPG/MMO present)
 *   - false → genres are exclusively no-map (Puzzle-only, Platformer-only…)
 *   - null  → ambiguous (Shooter, Strategy, Action alone, missing genres)
 *
 * Used to (a) gate Tier 3 Wikidata so we don't tombstone P242 lookups
 * forever for games that obviously won't have a locator, and (b) flag
 * candidates in the admin curate list so operators don't onboard
 * Portal 2 expecting a map.
 */
export function isMapEligibleByGenre(
  genres: readonly string[] | null | undefined,
): boolean | null {
  if (!genres || genres.length === 0) return null
  if (genres.some((g) => HAS_MAP_GENRES.has(g))) return true
  if (genres.every((g) => NO_MAP_GENRES.has(g))) return false
  return null
}
