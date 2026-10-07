/**
 * Alternative titles a game may be guessed by. The catalogue is imported from
 * RAWG under its English name while the UI is French, so players who know a
 * game by its French release title ("Pokémon Épée", "Les Sims") were refused.
 * RAWG's `alternative_names` carries many of these; this keeps the usable ones.
 *
 * Pure: no I/O, so importers and the sync worker share one rule.
 */

import { createFuzzyMatchService } from './fuzzy-match.service.js'

/** Hard cap so a noisy source can't bloat the per-guess alias scan. */
export const MAX_GAME_ALIASES = 20

/** Longest alias kept; a title is never this long, a scraped sentence is. */
export const MAX_ALIAS_LENGTH = 120

const silentLogger = {
  child() {
    return silentLogger
  },
  debug() {},
  info() {},
  warn() {},
  error() {},
}
const { parseGameTitle } = createFuzzyMatchService({ logger: silentLogger })

/** Lowercase, accents folded, punctuation dropped — the dedup key. */
function aliasKey(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Merge `incoming` alternative names into `existing` aliases.
 *
 * - existing aliases are kept as-is and first (admins curate them);
 * - an incoming name is kept only if it is written in the Latin alphabet
 *   (players type on a Latin keyboard; a Japanese or Cyrillic title can never
 *   be matched) and isn't the game's own name or a duplicate;
 * - an incoming name that carries a different sequel number than the game
 *   ("GTA 4" listed on Grand Theft Auto V, "Mario Kart 7" on Mario Kart 8)
 *   names another entry and is dropped, as is an over-long one;
 * - the result is capped at {@link MAX_GAME_ALIASES}.
 */
export function mergeGameAliases(
  gameName: string,
  existing: readonly string[],
  incoming: readonly (string | null | undefined)[]
): string[] {
  const result = [...existing]
  const seen = new Set([aliasKey(gameName), ...existing.map(aliasKey)])
  const gameNumber = parseGameTitle(gameName).seriesNumber
  for (const raw of incoming) {
    if (result.length >= MAX_GAME_ALIASES) break
    const alias = raw?.replace(/\s+/g, ' ').trim()
    if (!alias || alias.length > MAX_ALIAS_LENGTH) continue
    const aliasNumber = parseGameTitle(alias).seriesNumber
    if (aliasNumber !== null && gameNumber !== null && aliasNumber !== gameNumber) continue
    const key = aliasKey(alias)
    if (!/[a-z].*[a-z]/.test(key)) continue
    if (/[^\p{Script=Latin}\p{N}\p{P}\p{S}\s]/u.test(alias)) continue
    if (seen.has(key)) continue
    seen.add(key)
    result.push(alias)
  }
  return result
}
