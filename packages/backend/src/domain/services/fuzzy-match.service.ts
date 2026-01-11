import { serviceLogger } from '../../infrastructure/logger/logger.js'

const log = serviceLogger.child({ service: 'fuzzy-match' })

// Matching thresholds
const SERIES_NAME_THRESHOLD = 0.85
const SUBTITLE_THRESHOLD = 0.85
const ALIAS_THRESHOLD = 0.90
const FULL_MATCH_THRESHOLD = 0.88

// Roman numeral mapping
const ROMAN_TO_ARABIC: Record<string, number> = {
  I: 1,
  II: 2,
  III: 3,
  IV: 4,
  V: 5,
  VI: 6,
  VII: 7,
  VIII: 8,
  IX: 9,
  X: 10,
  XI: 11,
  XII: 12,
  XIII: 13,
  XIV: 14,
  XV: 15,
}

// Edition keywords to strip (case-insensitive)
const EDITION_KEYWORDS = [
  'complete edition',
  'legendary edition',
  'definitive edition',
  'game of the year',
  'goty edition',
  'goty',
  'final cut',
  'remastered',
  'remaster',
  'enhanced edition',
  'special edition',
  'ultimate edition',
  'premium edition',
  'directors cut',
  "director's cut",
  'hd',
  '3d',
]

interface ParsedGameTitle {
  seriesName: string | null
  seriesNumber: number | null
  subtitle: string | null
  original: string
  normalized: string
}

/**
 * Convert Roman numeral to Arabic number
 */
function romanToArabic(roman: string): number | null {
  const upper = roman.toUpperCase()
  return ROMAN_TO_ARABIC[upper] ?? null
}

/**
 * Extract series number from title part
 * Handles both Arabic (2, 3, 4) and Roman (II, III, IV) numerals
 * Looks for numbers anywhere in the string (end, middle, or beginning)
 */
function extractSeriesNumber(text: string): { number: number | null; remaining: string } {
  // Check for Roman numeral anywhere (e.g., "Dark Souls III", "Elder Scrolls V Skyrim")
  // Look for standalone Roman numerals (word boundaries)
  // Pattern covers I-XV: I, II, III, IV, V, VI, VII, VIII, IX, X, XI, XII, XIII, XIV, XV
  const romanMatch = text.match(/\b(XV|XIV|XIII|XII|XI|X|IX|VIII|VII|VI|V|IV|III|II|I)\b/i)
  if (romanMatch && romanMatch[1]) {
    const roman = romanMatch[1].toUpperCase()
    const num = romanToArabic(roman)
    if (num !== null) {
      return {
        number: num,
        remaining: text.replace(romanMatch[0], ' ').replace(/\s+/g, ' ').trim(),
      }
    }
  }

  // Check for Arabic number anywhere with word boundary (e.g., "Witcher 3", "Portal 2", "Fallout 4")
  const arabicMatch = text.match(/\b(\d+)\b/)
  if (arabicMatch && arabicMatch[1]) {
    const num = parseInt(arabicMatch[1], 10)
    if (num > 0 && num <= 50) {
      // Reasonable game sequel number
      return {
        number: num,
        remaining: text.replace(arabicMatch[0], ' ').replace(/\s+/g, ' ').trim(),
      }
    }
  }

  return { number: null, remaining: text }
}

/**
 * Strip edition keywords from title
 */
function stripEditionKeywords(text: string): string {
  let result = text.toLowerCase()
  for (const keyword of EDITION_KEYWORDS) {
    result = result.replace(new RegExp(`\\s*[-–—]?\\s*${keyword}\\s*`, 'gi'), ' ')
  }
  return result.replace(/\s+/g, ' ').trim()
}

/**
 * Normalize for fuzzy matching (removes all special chars)
 */
function normalizeForFuzzy(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Strip common prefixes like "The" for comparison
 */
function stripCommonPrefixes(text: string): string {
  return text.replace(/^the\s+/i, '').trim()
}

/**
 * Parse a game title into structured components
 *
 * Examples:
 * - "The Witcher 3: Wild Hunt" -> { seriesName: "The Witcher", seriesNumber: 3, subtitle: "Wild Hunt" }
 * - "Dark Souls III: The Ringed City" -> { seriesName: "Dark Souls", seriesNumber: 3, subtitle: "The Ringed City" }
 * - "Skyrim" -> { seriesName: null, seriesNumber: null, subtitle: "Skyrim" }
 */
function parseGameTitle(title: string): ParsedGameTitle {
  const strippedEdition = stripEditionKeywords(title)

  // Split on colon to get series:subtitle
  const colonIndex = strippedEdition.indexOf(':')

  let seriesPart: string
  let subtitlePart: string | null = null

  if (colonIndex > 0) {
    seriesPart = strippedEdition.slice(0, colonIndex).trim()
    subtitlePart = strippedEdition.slice(colonIndex + 1).trim()

    // Handle DLC suffix in subtitle (e.g., "Wild Hunt – Blood and Wine")
    const dlcMatch = subtitlePart.match(/^(.+?)(?:\s*[-–—]\s*.+)$/)
    if (dlcMatch) {
      // Keep the full subtitle including DLC for matching
      // but also store the base subtitle
    }
  } else {
    seriesPart = strippedEdition
  }

  // Extract series number from series part
  const { number: seriesNumber, remaining: seriesName } = extractSeriesNumber(seriesPart)

  // If no colon separator, treat as potential subtitle-only input
  // (user might type just "Skyrim" for "The Elder Scrolls V: Skyrim")
  const hasSeriesIndicators =
    seriesNumber !== null || seriesPart.toLowerCase().startsWith('the ') || seriesPart.split(' ').length > 2

  return {
    seriesName: hasSeriesIndicators ? seriesName : null,
    seriesNumber,
    subtitle: subtitlePart || (hasSeriesIndicators ? null : seriesPart),
    original: title,
    normalized: normalizeForFuzzy(strippedEdition),
  }
}

/**
 * Check if two series numbers match
 * - Both null -> true (no number requirement)
 * - One null, one present -> false (must match when specified)
 * - Both present -> must be equal
 */
function seriesNumbersMatch(inputNum: number | null, targetNum: number | null): boolean {
  // If input has no number, it can match target with number (e.g., "Witcher" matches "Witcher 3")
  // But if input HAS a number, it must match
  if (inputNum === null) {
    return true // Input doesn't specify a number, so it's not restrictive
  }
  if (targetNum === null) {
    return false // Input specifies a number but target doesn't have one
  }
  return inputNum === targetNum
}

/**
 * Check if input specifies a wrong series number
 */
function hasWrongSeriesNumber(inputNum: number | null, targetNum: number | null): boolean {
  if (inputNum === null || targetNum === null) {
    return false
  }
  return inputNum !== targetNum
}

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
  const jaro = (matches / s1.length + matches / s2.length + (matches - transpositions / 2) / matches) / 3

  // Winkler modification (prefix bonus)
  let prefix = 0
  for (let i = 0; i < Math.min(4, s1.length, s2.length); i++) {
    if (s1[i] === s2[i]) prefix++
    else break
  }

  return jaro + prefix * 0.1 * (1 - jaro)
}

/**
 * Check if a text contains only a subtitle (no series name/number)
 */
function isSubtitleOnly(parsed: ParsedGameTitle): boolean {
  return parsed.seriesName === null && parsed.seriesNumber === null && parsed.subtitle !== null
}

/**
 * Enhanced game title matching with structural awareness
 */
function isMatchEnhanced(input: string, gameName: string, aliases: string[] = []): boolean {
  const normalizedInput = normalizeForFuzzy(input)
  const normalizedTarget = normalizeForFuzzy(gameName)

  // 1. Quick exact match check (normalized)
  if (normalizedInput === normalizedTarget) {
    log.debug({ input, gameName }, 'exact match')
    return true
  }

  // 2. Check aliases with high threshold
  for (const alias of aliases) {
    const aliasSimilarity = jaroWinkler(normalizedInput, normalizeForFuzzy(alias))
    if (aliasSimilarity >= ALIAS_THRESHOLD) {
      log.debug({ input, alias, similarity: aliasSimilarity }, 'alias match')
      return true
    }
  }

  // 3. Structural matching
  const inputParsed = parseGameTitle(input)
  const targetParsed = parseGameTitle(gameName)

  log.debug({ inputParsed, targetParsed }, 'parsed titles')

  // 3a. Subtitle-only match (e.g., "Skyrim" for "The Elder Scrolls V: Skyrim")
  if (isSubtitleOnly(inputParsed) && targetParsed.subtitle) {
    const subtitleMatch = jaroWinkler(
      normalizeForFuzzy(inputParsed.subtitle!),
      normalizeForFuzzy(targetParsed.subtitle)
    )
    if (subtitleMatch >= SUBTITLE_THRESHOLD) {
      log.debug({ input, subtitle: targetParsed.subtitle, similarity: subtitleMatch }, 'subtitle match')
      return true
    }
  }

  // 3b. Series + number matching
  if (inputParsed.seriesName && targetParsed.seriesName) {
    // Compare series names with common prefix stripped (e.g., "Witcher" vs "The Witcher")
    const inputSeriesNorm = normalizeForFuzzy(stripCommonPrefixes(inputParsed.seriesName))
    const targetSeriesNorm = normalizeForFuzzy(stripCommonPrefixes(targetParsed.seriesName))
    const seriesMatch = jaroWinkler(inputSeriesNorm, targetSeriesNorm)

    // Check for wrong series number first (reject immediately)
    if (hasWrongSeriesNumber(inputParsed.seriesNumber, targetParsed.seriesNumber)) {
      log.debug(
        {
          input,
          gameName,
          inputNumber: inputParsed.seriesNumber,
          targetNumber: targetParsed.seriesNumber,
        },
        'wrong series number - rejected'
      )
      return false
    }

    // Series name must match well
    if (seriesMatch >= SERIES_NAME_THRESHOLD) {
      // Number must match if input specifies one
      if (seriesNumbersMatch(inputParsed.seriesNumber, targetParsed.seriesNumber)) {
        // Optional: check subtitle for additional confidence
        if (inputParsed.subtitle && targetParsed.subtitle) {
          const subtitleMatch = jaroWinkler(
            normalizeForFuzzy(inputParsed.subtitle),
            normalizeForFuzzy(targetParsed.subtitle)
          )
          if (subtitleMatch >= 0.7) {
            log.debug(
              { input, gameName, seriesMatch, subtitleMatch },
              'series + number + subtitle match'
            )
            return true
          }
        } else {
          // No subtitle in input, series + number is enough
          log.debug({ input, gameName, seriesMatch }, 'series + number match')
          return true
        }
      }
    }
  }

  // 4. Fallback: Full fuzzy with higher threshold
  const fullSimilarity = jaroWinkler(normalizedInput, normalizedTarget)
  if (fullSimilarity >= FULL_MATCH_THRESHOLD) {
    // Reject if input specifies wrong series number
    if (hasWrongSeriesNumber(inputParsed.seriesNumber, targetParsed.seriesNumber)) {
      log.debug({ input, gameName, similarity: fullSimilarity }, 'high similarity but wrong number')
      return false
    }

    // Reject if target has a series number but input doesn't
    // This prevents "Portal" from matching "Portal 2"
    // Exception: if there's a good subtitle match, allow it
    if (inputParsed.seriesNumber === null && targetParsed.seriesNumber !== null) {
      // Only allow if there's no subtitle in target (meaning it's just "Game N" format)
      // or if the input matches the subtitle well
      if (!targetParsed.subtitle) {
        log.debug(
          { input, gameName, similarity: fullSimilarity },
          'high similarity but target has number and input doesnt'
        )
        return false
      }
    }

    log.debug({ input, gameName, similarity: fullSimilarity }, 'full fuzzy match')
    return true
  }

  log.debug({ input, gameName, similarity: fullSimilarity }, 'no match')
  return false
}

export const fuzzyMatchService = {
  /**
   * Calculate similarity between two strings
   */
  calculateSimilarity(input: string, target: string): number {
    const normalizedInput = normalizeForFuzzy(input)
    const normalizedTarget = normalizeForFuzzy(target)
    return jaroWinkler(normalizedInput, normalizedTarget)
  },

  /**
   * Check if input matches the game name or any alias
   * Uses enhanced structural matching algorithm
   *
   * @param input - User's guess text
   * @param gameName - The correct game name
   * @param aliases - Alternative names for the game
   * @returns true if the input matches the game
   */
  isMatch(input: string, gameName: string, aliases: string[] = []): boolean {
    return isMatchEnhanced(input, gameName, aliases)
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
    const normalizedInput = normalizeForFuzzy(input)
    let bestScore = jaroWinkler(normalizedInput, normalizeForFuzzy(gameName))
    let matchedOn = gameName

    for (const alias of aliases) {
      const score = jaroWinkler(normalizedInput, normalizeForFuzzy(alias))
      if (score > bestScore) {
        bestScore = score
        matchedOn = alias
      }
    }

    return { bestScore, matchedOn }
  },

  /**
   * Parse a game title into structured components (exposed for testing)
   */
  parseGameTitle,

  /**
   * Check if two series numbers match (exposed for testing)
   */
  seriesNumbersMatch,
}
