import { serviceLogger } from '../../infrastructure/logger/logger.js'

const log = serviceLogger.child({ service: 'fuzzy-match' })

const SIMILARITY_THRESHOLD = 0.80

/**
 * Jaro-Winkler similarity algorithm
 * Returns a value between 0 and 1 (1 = exact match)
 */
function jaroWinkler(s1: string, s2: string): number {
  if (s1 === s2) return 1.0
  if (s1.length === 0 || s2.length === 0) return 0.0

  const matchWindow = Math.floor(Math.max(s1.length, s2.length) / 2) - 1
  const s1Matches = new Array(s1.length).fill(false)
  const s2Matches = new Array(s2.length).fill(false)

  let matches = 0
  let transpositions = 0

  // Find matches
  for (let i = 0; i < s1.length; i++) {
    const start = Math.max(0, i - matchWindow)
    const end = Math.min(i + matchWindow + 1, s2.length)

    for (let j = start; j < end; j++) {
      if (s2Matches[j] || s1[i] !== s2[j]) continue
      s1Matches[i] = true
      s2Matches[j] = true
      matches++
      break
    }
  }

  if (matches === 0) return 0.0

  // Count transpositions
  let k = 0
  for (let i = 0; i < s1.length; i++) {
    if (!s1Matches[i]) continue
    while (!s2Matches[k]) k++
    if (s1[i] !== s2[k]) transpositions++
    k++
  }

  // Jaro similarity
  const jaro =
    (matches / s1.length + matches / s2.length + (matches - transpositions / 2) / matches) / 3

  // Winkler modification (prefix bonus)
  let prefix = 0
  for (let i = 0; i < Math.min(4, s1.length, s2.length); i++) {
    if (s1[i] === s2[i]) prefix++
    else break
  }

  return jaro + prefix * 0.1 * (1 - jaro)
}

/**
 * Normalize text for comparison
 * - Lowercase
 * - Remove special characters
 * - Collapse multiple spaces
 */
function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export const fuzzyMatchService = {
  /**
   * Calculate similarity between two strings
   */
  calculateSimilarity(input: string, target: string): number {
    const normalizedInput = normalize(input)
    const normalizedTarget = normalize(target)
    return jaroWinkler(normalizedInput, normalizedTarget)
  },

  /**
   * Check if input matches the game name or any alias
   * @param input - User's guess text
   * @param gameName - The correct game name
   * @param aliases - Alternative names for the game
   * @returns true if similarity >= threshold for any match
   */
  isMatch(input: string, gameName: string, aliases: string[] = []): boolean {
    const normalizedInput = normalize(input)

    // Check against game name
    const nameSimilarity = jaroWinkler(normalizedInput, normalize(gameName))
    if (nameSimilarity >= SIMILARITY_THRESHOLD) {
      log.debug({ input, gameName, similarity: nameSimilarity }, 'fuzzy match success on name')
      return true
    }

    // Check against each alias
    for (const alias of aliases) {
      const aliasSimilarity = jaroWinkler(normalizedInput, normalize(alias))
      if (aliasSimilarity >= SIMILARITY_THRESHOLD) {
        log.debug({ input, alias, similarity: aliasSimilarity }, 'fuzzy match success on alias')
        return true
      }
    }

    log.debug({ input, gameName, aliases, maxSimilarity: nameSimilarity }, 'fuzzy match failed')
    return false
  },

  /**
   * Get the best match score for debugging/logging
   */
  getBestMatchScore(
    input: string,
    gameName: string,
    aliases: string[] = []
  ): {
    bestScore: number
    matchedOn: string
  } {
    const normalizedInput = normalize(input)
    let bestScore = jaroWinkler(normalizedInput, normalize(gameName))
    let matchedOn = gameName

    for (const alias of aliases) {
      const score = jaroWinkler(normalizedInput, normalize(alias))
      if (score > bestScore) {
        bestScore = score
        matchedOn = alias
      }
    }

    return { bestScore, matchedOn }
  },
}
