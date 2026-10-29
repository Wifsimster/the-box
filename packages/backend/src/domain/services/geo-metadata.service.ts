export const FANDOM_MAP_NAMESPACE = 2900

export const CAPTURE_TARGET_CANDIDATES = 30

export function wikiSubdomainCandidates(slug: string): string[] {
  const cleaned = slug.toLowerCase().trim()
  if (!cleaned) return []

  const collapsed = cleaned.replace(/[^a-z0-9]/g, '')
  const dashed = cleaned.replace(/[^a-z0-9-]/g, '')
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

function hasSpecificGameSignal(t: string, name: string, slugTokens: readonly string[]): boolean {
  if (name && t.includes(name)) return true
  return slugTokens.some((tok) => t.includes(tok))
}

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

  if (!hasSpecificGameSignal(t, name, slugTokens)) return Number.NEGATIVE_INFINITY

  let score = 0
  if (name && t.includes(name)) score += 50
  if (name && t === name) score += 30
  for (const tok of slugTokens) {
    if (t.includes(tok)) score += 8
  }
  if (/\b(world|overworld|atlas|main|full|complete|central|overview)\b/.test(t))
    score += 20
  if (/\bmap\b/.test(t)) score += 5
  if (/\b(zone|region|area|level|dlc|dungeon|interior|building|biome|district|chapter|episode|part|act|mission|quest)\b/.test(t))
    score -= 8
  if (/\b(?:[ivx]+|\d+)$/.test(t)) score -= 8
  const tokens = t.split(/\s+/).filter(Boolean)
  if (tokens.length <= 1) score -= 15
  if (t === 'map' || t === 'maps') score -= 30
  return score
}

export function pickBestMapTitle(
  titles: readonly string[],
  gameName: string,
  slug: string,
): string | null {
  const ranked = titles
    .map((title) => ({ title, score: scoreMapTitle(title, gameName, slug) }))
    .filter((r) => Number.isFinite(r.score))
    .sort((a, b) => b.score - a.score)
  return ranked[0]?.title ?? null
}

const WIKI_STOPWORDS = new Set([
  'gamepedia', 'fandom', 'wiki', 'wikia', 'en', 'community', 'the',
])

export function fandomWikiBaseTokens(subdomain: string): string[] {
  return subdomain
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((tok) => tok.length > 0 && !WIKI_STOPWORDS.has(tok))
}

export function isFranchiseWiki(subdomain: string, slug: string): boolean {
  const collapsed = slug.toLowerCase().replace(/[^a-z0-9]/g, '')
  const base = fandomWikiBaseTokens(subdomain).join('')
  if (!base || !collapsed) return false
  if (collapsed === base) return false
  return collapsed.length > base.length + 3
}

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

export function parseSteamAppIdFromUrl(url: string | null | undefined): number | null {
  if (!url) return null
  const m = url.match(/store\.steampowered\.com\/app\/(\d+)/i)
  if (!m) return null
  const id = Number(m[1])
  return Number.isFinite(id) && id > 0 ? id : null
}

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

export function extractVersionTokens(normalized: string): string[] {
  return normalized
    .split(/\s+/)
    .filter((tok) => /^\d+$/.test(tok) || ROMAN_NUMERAL_TOKENS.has(tok))
}

export function versionTokensMatch(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false
  const sortedA = [...a].sort()
  const sortedB = [...b].sort()
  return sortedA.every((tok, i) => tok === sortedB[i])
}

export function tombstoneRetryAfter(attemptCount: number, now: Date = new Date()): Date {
  const days = Math.min(2 ** Math.max(0, attemptCount - 1), 30)
  return new Date(now.getTime() + days * 24 * 60 * 60 * 1000)
}

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

export function isMapEligibleByGenre(
  genres: readonly string[] | null | undefined,
): boolean | null {
  if (!genres || genres.length === 0) return null
  if (genres.some((g) => HAS_MAP_GENRES.has(g))) return true
  if (genres.every((g) => NO_MAP_GENRES.has(g))) return false
  return null
}
