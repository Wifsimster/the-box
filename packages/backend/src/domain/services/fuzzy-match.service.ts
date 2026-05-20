import type { DomainLogger } from '../ports/logger.js'

// Matching thresholds
const SERIES_NAME_THRESHOLD = 0.85
const SUBTITLE_THRESHOLD = 0.85
const ALIAS_THRESHOLD = 0.90
const FULL_MATCH_THRESHOLD = 0.88
// Token-sort: input and target are accepted as a reorder of each other
// only when the sorted-token join is near-identical. The threshold has to
// stay tight enough that "witcher 3" ("3 witcher" sorted) does NOT match
// "the witcher 3 wild hunt" ("3 hunt the wild witcher" sorted) via this
// path — that case is still owned by the series-with-subtitle logic.
const TOKEN_SORT_THRESHOLD = 0.95
// Safety floor: when the full-string JW is this low AND the input shares no
// meaningful token (≥3 chars) with the target, refuse to match no matter
// what later heuristics decide. Catches obvious mis-types like
// "garage band" → "Xenoblade Chronicles 3D".
const HARD_FLOOR_SIMILARITY = 0.55
const MEANINGFUL_TOKEN_MIN_LENGTH = 3

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
  baseName: string | null // Part before colon (for DLC detection)
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

  // Check for Arabic number anywhere with word boundary (e.g., "Witcher 3", "Portal 2", "Fallout 4").
  // Digit groups with thousands separators ("Warhammer 40,000") are read as
  // one number so they parse identically to the separator-free form — both
  // land above the sequel-number ceiling and are treated as franchise
  // flavour, not a series number. Without this, "40,000" yields just "40".
  const arabicMatch = text.match(/\b\d{1,3}(?:[.,]\d{3})+\b|\b\d+\b/)
  if (arabicMatch) {
    const raw = arabicMatch[0]
    const num = parseInt(raw.replace(/[.,]/g, ''), 10)
    if (num > 0 && num <= 50) {
      // Reasonable game sequel number
      return {
        number: num,
        remaining: text.replace(raw, ' ').replace(/\s+/g, ' ').trim(),
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
  // General pattern: "game of the <word(s)> edition" (e.g., "Game of the YoRHa Edition")
  result = result.replace(/\s*[-–—]?\s*game of the \w+ edition\s*/gi, ' ')
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
 * Drop a trailing expansion / DLC suffix introduced by a spaced dash, e.g.
 * "Dawn of War - Dark Crusade" -> "Dawn of War" or
 * "Wild Hunt – Blood and Wine" -> "Wild Hunt". The base game is a fair
 * guess for an expansion-titled challenge, so the pre-dash core is offered
 * as an extra match candidate. Hyphens without surrounding spaces
 * ("Half-Life", "Spider-Man") are part of the name and left untouched.
 */
function stripExpansionSuffix(name: string): string {
  const match = name.match(/^(.+?)\s+[-–—]\s+.+$/)
  return match?.[1]?.trim() ?? name
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

  // Split on colon ONLY if followed by a space (e.g., "The Witcher 3: Wild Hunt")
  // Colons without spaces (e.g., "NieR:Automata") are treated as part of the word
  const colonMatch = strippedEdition.match(/:\s/)
  const colonIndex = colonMatch?.index ?? -1

  let seriesPart: string
  let subtitlePart: string | null = null

  if (colonIndex > 0) {
    seriesPart = strippedEdition.slice(0, colonIndex).trim()
    subtitlePart = strippedEdition.slice(colonIndex + 1).trim()
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
    baseName: colonIndex > 0 ? seriesPart : null, // Store base name when title has colon
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
 * Split a normalized string into tokens, dropping empties.
 */
function tokenize(text: string): string[] {
  return text.split(/\s+/).filter(Boolean)
}

/**
 * Initials of the alphabetic tokens of a multi-word franchise name, so
 * "Grand Theft Auto" → "gta", "The Last of Us" → "tlou",
 * "Breath of the Wild" → "botw". Stop tokens stay in (players say "tlou"
 * and "botw", not "lu" / "bw"). Digit-only tokens are dropped so that
 * "Resident Evil 4" → "re", not "re4". Returns null for single-word
 * sources, where an acronym would be a single character and over-fire.
 */
function deriveAcronym(name: string): string | null {
  const toks = tokenize(normalizeForFuzzy(name)).filter(t => /^[a-z]/.test(t))
  if (toks.length < 2) return null
  const acronym = toks.map(t => t[0]).join('')
  return acronym.length >= 2 ? acronym : null
}

/**
 * Jaro-Winkler over both strings after their tokens have been sorted
 * alphabetically. This makes the comparison invariant to word order, so
 * "total war rome" and "rome total war" score 1.0.
 */
function tokenSortSimilarity(a: string, b: string): number {
  const ta = tokenize(a).sort().join(' ')
  const tb = tokenize(b).sort().join(' ')
  return jaroWinkler(ta, tb)
}

/**
 * Returns true when at least one input token of meaningful length
 * appears (as a substring match or near-equal token) anywhere in the
 * target or its aliases. Used as a safety floor: an input that shares no
 * substantial word with anything in the candidate set should never be a
 * "yes". Stop words like "the", "of", "and" are excluded so they can't
 * single-handedly carry an unrelated guess across the floor.
 */
const STOP_TOKENS = new Set(['the', 'of', 'and', 'a', 'an', 'in', 'on', 'to', 'for', 'vs', 'de', 'la', 'le', 'les', 'du'])

function hasMeaningfulTokenOverlap(input: string, candidates: string[]): boolean {
  const inputTokens = tokenize(input).filter(
    t => t.length >= MEANINGFUL_TOKEN_MIN_LENGTH && !STOP_TOKENS.has(t)
  )
  if (inputTokens.length === 0) {
    // No meaningful tokens to compare; defer to other heuristics
    return true
  }
  const candidateTokens = candidates.flatMap(c => tokenize(c))
  for (const it of inputTokens) {
    for (const ct of candidateTokens) {
      if (ct.length < MEANINGFUL_TOKEN_MIN_LENGTH) continue
      // Substring containment in either direction catches typos like
      // "conquers" vs "conquer" and prefixes like "starcr" vs "starcraft".
      if (ct.includes(it) || it.includes(ct)) return true
      if (jaroWinkler(it, ct) >= 0.9) return true
    }
  }
  return false
}

// DLC indicator keywords in subtitles (case-insensitive)
const DLC_KEYWORDS = [
  'dlc',
  'expansion',
  'last course',
  'delicious last course',
  'blood and wine',
  'hearts of stone',
  'the following',
  'standalone',
]

/**
 * Check if subtitle suggests this is a DLC/expansion
 */
function isLikelyDLC(subtitle: string): boolean {
  const normalizedSubtitle = subtitle.toLowerCase()
  return DLC_KEYWORDS.some(keyword => normalizedSubtitle.includes(keyword))
}

/**
 * Check if input appears to be an incomplete/truncated version of the base name
 * Rejects cases like "A Space for the Unb" for "A Space for the Unbound"
 */
function isIncompleteBaseName(input: string, baseName: string): boolean {
  const normalizedInput = normalizeForFuzzy(stripCommonPrefixes(input))
  const normalizedBaseName = normalizeForFuzzy(stripCommonPrefixes(baseName))
  
  // Check if input is a prefix of baseName (incomplete word at the end)
  // This catches cases like "A Space for the Unb" vs "A Space for the Unbound"
  if (normalizedBaseName.startsWith(normalizedInput)) {
    // Input is a prefix - check if it ends mid-word (not at a word boundary)
    const inputWords = normalizedInput.trim().split(/\s+/)
    const baseNameWords = normalizedBaseName.trim().split(/\s+/)
    
    // If input has fewer words, it's likely incomplete
    if (inputWords.length < baseNameWords.length) {
      return true
    }
    
    // If same number of words but input is shorter, check if last word is incomplete
    if (inputWords.length === baseNameWords.length && inputWords.length > 0) {
      const lastInputWord = inputWords[inputWords.length - 1]
      const lastBaseWord = baseNameWords[baseNameWords.length - 1]
      // If last word of input is a prefix of last word of baseName and significantly shorter, it's incomplete
      // Require at least 2 characters difference to avoid false positives with short words
      if (lastInputWord && lastBaseWord && 
          lastBaseWord.startsWith(lastInputWord) && 
          lastInputWord.length < lastBaseWord.length && 
          (lastBaseWord.length - lastInputWord.length) >= 2) {
        return true
      }
    }
  }
  
  // Also check if input is significantly shorter (more than 15% shorter) and starts with baseName
  // This catches cases where input might be incomplete even if not a strict prefix
  const lengthRatio = normalizedInput.length / normalizedBaseName.length
  if (lengthRatio < 0.85 && normalizedBaseName.startsWith(normalizedInput)) {
    return true
  }
  
  return false
}

/**
 * Check if input matches only the base name of a "Base: Subtitle" title
 * Used to reject matches like "Cuphead" for "Cuphead: The Delicious Last Course"
 * DLCs should not be matched by their base game name alone
 *
 * Exception: If input has a series number that matches target's, it's specific enough
 * (e.g., "Witcher 3" for "The Witcher 3: Wild Hunt" is allowed)
 * Exception: Main games with subtitles (like "Castlevania: Harmony of Dissonance") should allow base name matches
 */
function isBaseNameOnlyMatch(input: string, targetParsed: ParsedGameTitle): boolean {
  // Only applies to titles with both a base name and subtitle (format: "Base: Subtitle")
  if (!targetParsed.baseName || !targetParsed.subtitle) return false

  // If target has a series number, allow matching with the number
  // (e.g., "Witcher 3" should match "The Witcher 3: Wild Hunt")
  if (targetParsed.seriesNumber !== null) {
    const inputParsed = parseGameTitle(input)
    // If input also has the matching series number, it's specific enough
    if (inputParsed.seriesNumber === targetParsed.seriesNumber) {
      return false // Not a base-name-only match, allow it to continue
    }
  }

  const normalizedInput = normalizeForFuzzy(input)
  const normalizedBaseName = normalizeForFuzzy(targetParsed.baseName)

  // Check if input closely matches the base name
  const baseNameSimilarity = jaroWinkler(normalizedInput, normalizedBaseName)
  if (baseNameSimilarity < 0.90) return false

  // Check that input does NOT match the subtitle
  const subtitleSimilarity = jaroWinkler(normalizedInput, normalizeForFuzzy(targetParsed.subtitle))
  if (subtitleSimilarity >= SUBTITLE_THRESHOLD) return false

  // Only reject if the subtitle suggests this is a DLC/expansion
  // Main games with subtitles (like "Castlevania: Harmony of Dissonance") should allow base name matches
  if (!isLikelyDLC(targetParsed.subtitle)) {
    return false // Not a DLC, allow the match
  }

  // Input matches base name but not subtitle, and subtitle suggests DLC = reject
  return true
}

/**
 * Enhanced game title matching with structural awareness
 */
function isMatchEnhanced(
  input: string,
  gameName: string,
  aliases: string[] = [],
  log: DomainLogger,
  expandedRetry: boolean = false
): boolean {
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

  // 2.5. Hard rejection floor. When the overall similarity is very low and
  // the input shares no meaningful token with the target or any alias,
  // refuse to match before structural heuristics have a chance to over-
  // generalise. This blocks pathological cases like
  //   "garage band" → "Xenoblade Chronicles 3D"
  // without disturbing legitimate fuzzy matches (which all sit far above
  // the floor or have a real token in common).
  const baselineSimilarity = jaroWinkler(normalizedInput, normalizedTarget)
  if (baselineSimilarity < HARD_FLOOR_SIMILARITY) {
    const candidates = [normalizedTarget, ...aliases.map(normalizeForFuzzy)]
    if (!hasMeaningfulTokenOverlap(normalizedInput, candidates)) {
      log.debug(
        { input, gameName, similarity: baselineSimilarity },
        'rejected - hard floor (no meaningful token overlap)'
      )
      return false
    }
  }

  // 3. Structural matching
  const inputParsed = parseGameTitle(input)
  const targetParsed = parseGameTitle(gameName)

  log.debug({ inputParsed, targetParsed }, 'parsed titles')

  // 3.-1. Derived-acronym expansion. If the input begins with an initialism
  // of the target's franchise name (e.g. "gta" for "Grand Theft Auto",
  // "tes" for "The Elder Scrolls"), rewrite the input by swapping the
  // acronym for the full franchise and retry once. Requires at least one
  // disambiguating token after the acronym so a bare "gta" doesn't
  // collapse onto any specific entry. Recursion is depth-1 via the
  // expandedRetry flag.
  if (!expandedRetry) {
    const inputTokens = tokenize(normalizedInput)
    if (inputTokens.length >= 2) {
      const acronymSource = targetParsed.seriesName ?? targetParsed.baseName ?? gameName
      const acronym = deriveAcronym(acronymSource)
      if (acronym && inputTokens[0] === acronym) {
        const expanded = [
          normalizeForFuzzy(acronymSource),
          ...inputTokens.slice(1),
        ].join(' ')
        log.debug({ input, expanded, acronym }, 'trying acronym-expanded input')
        if (isMatchEnhanced(expanded, gameName, aliases, log, true)) {
          return true
        }
      }
    }
  }

  // 3.0. Early rejection: Base name only match for DLC titles
  // Prevents "Cuphead" from matching "Cuphead: The Delicious Last Course"
  // Check this FIRST before allowing base name matches
  if (isBaseNameOnlyMatch(input, targetParsed)) {
    log.debug(
      { input, gameName, baseName: targetParsed.baseName },
      'rejected - base name only match for title with subtitle (DLC)'
    )
    return false
  }

  // 3.1. Check if input matches the base name (series name) of a "Base: Subtitle" title
  // Allow "Paper Mario" to match "Paper Mario: The Thousand-Year Door"
  // Allow "Castlevania" to match "Castlevania: Harmony of Dissonance"
  // Allow "Cut the Rope" to match "Cut the Rope: Magic"
  // Allow "Teenage Mutant Ninja Turtles" to match "Teenage Mutant Ninja Turtles: Shredder's Revenge"
  // Allow "Half-Life 2" to match "Half-Life 2: Episode Two"
  // Reject "Half-Life" (missing number) for "Half-Life 2: Episode Two"
  //   — caught by isIncompleteBaseName below, since "halflife" is a prefix of "halflife 2"
  // Allow "Planetscape" (typo) to match "Planescape: Torment"
  // Reject "A Space for the Unb" (incomplete) for "A Space for the Unbound"
  // Only check this if it's NOT a DLC (checked above)
  if (targetParsed.baseName && targetParsed.subtitle) {
    const normalizedInput = normalizeForFuzzy(stripCommonPrefixes(input))
    const normalizedBaseName = normalizeForFuzzy(stripCommonPrefixes(targetParsed.baseName))

    // Reject incomplete/truncated inputs first so a subtitle path can't
    // rescue them (e.g., "A Space for the Unb" for "A Space for the Unbound").
    if (isIncompleteBaseName(input, targetParsed.baseName)) {
      log.debug(
        { input, gameName, baseName: targetParsed.baseName },
        'rejected - incomplete base name'
      )
      return false
    }

    // Only enforce the series-number guard when the input actually looks
    // like a base-name match. Otherwise we'd reject perfectly valid
    // subtitle-only guesses such as "Skyrim" → "The Elder Scrolls V: Skyrim",
    // where the input has no number simply because it isn't trying to
    // restate the base name.
    const baseNameSimilarity =
      normalizedInput === normalizedBaseName
        ? 1
        : jaroWinkler(normalizedInput, normalizedBaseName)
    const requiredSimilarity = 0.90

    if (baseNameSimilarity >= requiredSimilarity) {
      if (
        targetParsed.seriesNumber !== null &&
        inputParsed.seriesNumber === null
      ) {
        log.debug(
          { input, gameName, targetNumber: targetParsed.seriesNumber },
          'rejected - base-name match but missing required series number'
        )
        return false
      }
      if (hasWrongSeriesNumber(inputParsed.seriesNumber, targetParsed.seriesNumber)) {
        log.debug(
          {
            input,
            gameName,
            inputNumber: inputParsed.seriesNumber,
            targetNumber: targetParsed.seriesNumber,
          },
          'rejected - base-name match but wrong series number'
        )
        return false
      }
      // A numbered input against a subtitled-but-unnumbered target is
      // naming a different entry in the franchise. "grand thief auto 3"
      // for "Grand Theft Auto: Vice City" must reject — the input asserts
      // a 3, Vice City is the named entry with no number. Bypass only
      // when the input also looks like the subtitle (player wrote both).
      if (
        targetParsed.seriesNumber === null &&
        targetParsed.subtitle !== null &&
        inputParsed.seriesNumber !== null
      ) {
        const subtitleSim = jaroWinkler(
          normalizedInput,
          normalizeForFuzzy(targetParsed.subtitle)
        )
        if (subtitleSim < SUBTITLE_THRESHOLD) {
          log.debug(
            { input, gameName, inputNumber: inputParsed.seriesNumber },
            'rejected - numbered input on subtitled-unnumbered target'
          )
          return false
        }
      }
      log.debug(
        { input, gameName, baseName: targetParsed.baseName, similarity: baseNameSimilarity },
        'base name match (series with subtitle)'
      )
      return true
    }
  }

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
        } else if (
          inputParsed.seriesNumber === null &&
          targetParsed.seriesNumber !== null &&
          !targetParsed.subtitle
        ) {
          // Input lacks a number, target carries one with no subtitle:
          // "Grand Theft Auto" → "Grand Theft Auto V" or
          // "grand theft auto vice city" → "Grand Theft Auto V" (acronym-
          // expansion artifact). Mirror the full-fuzzy guard at line ~689
          // and skip this branch — let path 4's reject fire instead of
          // accepting here.
          log.debug(
            { input, gameName, seriesMatch },
            'series match without number — deferring to full-fuzzy guard'
          )
        } else {
          // No subtitle in input, series + number is enough
          log.debug({ input, gameName, seriesMatch }, 'series + number match')
          return true
        }
      }
    }
  }

  // 3c. Token-sort match. When the input contains the same words as the
  // target (or alias) in a different order, accept it. Players naturally
  // reorder ("total war rome" ↔ "ROME: Total War"), and JW alone is too
  // sensitive to position to catch this.
  //
  // The same number-mismatch guards as the full-fuzzy fallback apply, so
  // "witcher 2 wild hunt" can't sneak into "The Witcher 3: Wild Hunt".
  const tokenSortCandidates = [normalizedTarget, ...aliases.map(normalizeForFuzzy)]
  for (const candidate of tokenSortCandidates) {
    const tokenSortScore = tokenSortSimilarity(normalizedInput, candidate)
    if (tokenSortScore < TOKEN_SORT_THRESHOLD) continue

    if (hasWrongSeriesNumber(inputParsed.seriesNumber, targetParsed.seriesNumber)) {
      log.debug(
        { input, gameName, score: tokenSortScore },
        'token-sort match rejected - wrong series number'
      )
      return false
    }
    if (
      inputParsed.seriesNumber === null &&
      targetParsed.seriesNumber !== null &&
      !targetParsed.subtitle
    ) {
      log.debug(
        { input, gameName, score: tokenSortScore },
        'token-sort match rejected - target has number, input does not'
      )
      return false
    }
    log.debug({ input, gameName, candidate, score: tokenSortScore }, 'token-sort match')
    return true
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

export interface FuzzyMatchService {
  /**
   * Calculate similarity between two strings
   */
  calculateSimilarity(input: string, target: string): number
  /**
   * Check if input matches the game name or any alias
   * Uses enhanced structural matching algorithm
   */
  isMatch(input: string, gameName: string, aliases?: string[]): boolean
  /**
   * Get the best match score for debugging/logging
   */
  getBestMatchScore(
    input: string,
    gameName: string,
    aliases?: string[]
  ): { bestScore: number; matchedOn: string }
  /**
   * Parse a game title into structured components (exposed for testing)
   */
  parseGameTitle: typeof parseGameTitle
  /**
   * Check if two series numbers match (exposed for testing)
   */
  seriesNumbersMatch: typeof seriesNumbersMatch
}

export interface FuzzyMatchServiceDeps {
  logger: DomainLogger
}

/**
 * Create a FuzzyMatchService with injected dependencies.
 * The logger is used for debug-level tracing inside the matching algorithm.
 */
export function createFuzzyMatchService(deps: FuzzyMatchServiceDeps): FuzzyMatchService {
  const log = deps.logger.child({ service: 'fuzzy-match' })

  return {
    calculateSimilarity(input: string, target: string): number {
      const normalizedInput = normalizeForFuzzy(input)
      const normalizedTarget = normalizeForFuzzy(target)
      return jaroWinkler(normalizedInput, normalizedTarget)
    },

    isMatch(input: string, gameName: string, aliases: string[] = []): boolean {
      if (isMatchEnhanced(input, gameName, aliases, log)) {
        return true
      }
      // Retry against the base title with any " - Expansion" suffix removed,
      // so the base game is accepted for an expansion-titled challenge
      // (e.g. "Warhammer Dawn of War" for
      // "Warhammer 40,000: Dawn of War - Dark Crusade").
      const core = stripExpansionSuffix(gameName)
      if (core !== gameName && isMatchEnhanced(input, core, aliases, log)) {
        return true
      }
      return false
    },

    getBestMatchScore(
      input: string,
      gameName: string,
      aliases: string[] = []
    ): { bestScore: number; matchedOn: string } {
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

    parseGameTitle,
    seriesNumbersMatch,
  }
}
