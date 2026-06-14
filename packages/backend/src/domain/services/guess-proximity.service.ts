import type { Game, GuessProximityHint } from '@the-box/types'

/**
 * Smart-guess "warmer" hints.
 *
 * When a player misses, a raw "Incorrect" is a dead end — they learn nothing.
 * But players very often miss with a *related* game: a different entry in the
 * same franchise, or a different title by the same studio or publisher (a
 * classic example: guessing "Baldur's Gate 3" when the answer is
 * "Divinity: Original Sin" — both Larian Studios). This service resolves the
 * wrong guess to a known catalogue game and, if it shares a franchise /
 * developer / publisher with the answer, returns a hint so the UI can tell the
 * player they are "warm".
 *
 * Anti-leak contract: the returned `value` is always an attribute of the game
 * the player *named themselves* (its franchise / studio / publisher), never the
 * answer's title. We also refuse to derive a hint from the answer's own row, so
 * a near-miss can't be used to confirm the title.
 *
 * Pure domain logic: no DB / HTTP imports. Candidate games are supplied by the
 * caller (the repository pre-filters the catalogue) and the fuzzy matcher is
 * injected.
 */

/** Minimal shape of the answer we need — keeps this decoupled from `Game`. */
export interface ProximityAnswer {
  id: number
  name: string
  developer?: string
  publisher?: string
}

/** Just the parts of the fuzzy-match service this computation depends on. */
export interface ProximityFuzzyMatcher {
  isMatch(input: string, gameName: string, aliases?: string[]): boolean
  parseGameTitle(title: string): { seriesName: string | null; baseName: string | null }
}

export interface ComputeGuessProximityInput {
  guessText: string
  answer: ProximityAnswer
  /** Catalogue games pre-filtered by the repository as plausible matches. */
  candidates: Game[]
  fuzzyMatch: ProximityFuzzyMatcher
}

/** Lowercase, strip diacritics + punctuation, collapse whitespace. */
function normalizeText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/** Compare two studio / publisher strings for a confident, non-empty match. */
function sameOrg(a: string | undefined, b: string | undefined): boolean {
  if (!a || !b) return false
  const na = normalizeText(a)
  const nb = normalizeText(b)
  return na.length > 0 && na === nb
}

/**
 * Human-readable franchise label from a full title: the part before the first
 * colon, or the title with a trailing series number removed. Used only for
 * display — the comparison key comes from `parseGameTitle`.
 */
function franchiseLabel(name: string): string {
  const colon = name.indexOf(':')
  const base = colon > 0 ? name.slice(0, colon) : name
  // Drop a trailing standalone number / roman numeral (e.g. "Diablo IV" -> "Diablo").
  return base.replace(/\s+(\d+|[ivxlcdm]+)$/i, '').trim() || base.trim()
}

/** Normalized franchise key for a title, or null when it has no series root. */
function franchiseKey(name: string, fuzzy: ProximityFuzzyMatcher): string | null {
  const parsed = fuzzy.parseGameTitle(name)
  const root = parsed.seriesName ?? parsed.baseName
  if (!root) return null
  const key = normalizeText(root)
  // Guard against over-broad one/two-letter roots ("X", "Go") matching noise.
  return key.length >= 3 ? key : null
}

/**
 * Resolve `guessText` to a related catalogue game and describe how it relates
 * to the answer. Returns `null` when the guess is unrecognised or shares
 * nothing with the answer.
 */
export function computeGuessProximityHint(
  input: ComputeGuessProximityInput
): GuessProximityHint | null {
  const { guessText, answer, candidates, fuzzyMatch } = input
  if (!guessText.trim() || candidates.length === 0) return null

  // Find the catalogue game the player most plausibly meant. Never resolve to
  // the answer's own row — that would let a near-miss confirm the title.
  let matched: Game | undefined
  for (const candidate of candidates) {
    if (candidate.id === answer.id) continue
    if (fuzzyMatch.isMatch(guessText, candidate.name, candidate.aliases ?? [])) {
      matched = candidate
      break
    }
  }
  if (!matched) return null

  // Most specific signal first: same franchise > same developer > same publisher.
  const answerFranchise = franchiseKey(answer.name, fuzzyMatch)
  const guessFranchise = franchiseKey(matched.name, fuzzyMatch)
  if (answerFranchise && guessFranchise && answerFranchise === guessFranchise) {
    return { relation: 'same_franchise', value: franchiseLabel(matched.name) }
  }

  if (sameOrg(answer.developer, matched.developer)) {
    return { relation: 'same_developer', value: matched.developer! }
  }

  if (sameOrg(answer.publisher, matched.publisher)) {
    return { relation: 'same_publisher', value: matched.publisher! }
  }

  return null
}
