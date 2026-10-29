import { createFuzzyMatchService } from './fuzzy-match.service.js'

export const MAX_GAME_ALIASES = 20

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

function aliasKey(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
}

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
