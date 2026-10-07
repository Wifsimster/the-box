import type { DomainLogger } from '../ports/logger.js'

/**
 * Fuzzy "guess the game title" matcher.
 *
 * The answer check used to be a chain of Jaro-Winkler thresholds over the
 * whole string. Jaro-Winkler rewards a shared prefix and ignores whole words,
 * so "pokemon red" scored full credit on "Pokémon Blue", "dead space" on
 * "Dead Cells" and "hades 2" on "Hades", while "ff7" or "zelda botw" earned
 * nothing. This version reasons about WORDS instead:
 *
 *   1. both sides are normalised the same way (accents folded, apostrophes
 *      and punctuation dropped, "&"/"et" read as "and", roman numerals and
 *      number words read as digits, glued shorthand such as "ff7" split);
 *   2. the title is parsed into units — base, subtitle(s), expansion(s),
 *      parenthesised alternate name, year, comma alternatives ("Pokémon X, Y")
 *      — plus the curated aliases;
 *   3. every meaningful word of the guess must be EXPLAINED by the title: the
 *      same word (typo-tolerant), an acronym of a run of words ("gta",
 *      "botw", "tlou2"), a glued run ("halflife"), or a split word ("star
 *      craft"). A word the title cannot explain, or a number the title does
 *      not carry, is a different game → `none`;
 *   4. the guess is `exact` when it covers one of the title's full FORMS —
 *      the whole title, the entry's own name (subtitle / expansion /
 *      alternate name / alias) or the franchise plus its sequel number — and
 *      `partial` when it only names the franchise or some words of the
 *      title.
 *
 * Player-facing contract: docs/game-flow.md, "Réponses acceptées". The
 * letter-reveal leak gate (letter-reveal.service.ts) is verified against
 * `evaluateMatch(...).matched`, so no revealed fragment may ever earn credit.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

/** Guesses are capped before any work: the alignment is quadratic in tokens. */
const MAX_INPUT_LENGTH = 200

/** Largest number read as a sequel number ("Fallout 76" yes, "1942" no). */
const SEQUEL_NUMBER_MAX = 99

const ROMAN_TO_ARABIC: Record<string, number> = {
  i: 1, ii: 2, iii: 3, iv: 4, v: 5, vi: 6, vii: 7, viii: 8, ix: 9, x: 10,
  xi: 11, xii: 12, xiii: 13, xiv: 14, xv: 15, xvi: 16, xvii: 17, xviii: 18,
  xix: 19, xx: 20,
}

/** Number words and ordinals as they appear in titles ("Episode Two", "The 2nd Runner"). */
const NUMBER_WORDS: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7,
  eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
  first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7,
  eighth: 8, ninth: 9, tenth: 10,
  '1st': 1, '2nd': 2, '3rd': 3, '4th': 4, '5th': 5, '6th': 6, '7th': 7,
  '8th': 8, '9th': 9, '10th': 10,
  // French players: "gta cinq", "witcher trois" ("un"/"une" stay articles).
  deux: 2, trois: 3, quatre: 4, cinq: 5, sept: 7, huit: 8, neuf: 9, dix: 10,
}

/**
 * Initials of compound one-word franchises players abbreviate ("bf1" for
 * Battlefield 1, "sc2" for StarCraft II). One initial per word cannot
 * derive these.
 */
const COMPOUND_INITIALS: Record<string, string> = {
  battlefield: 'bf',
  borderlands: 'bl',
  starcraft: 'sc',
  warcraft: 'wc',
  overwatch: 'ow',
  minecraft: 'mc',
  battlefront: 'bf',
  bioshock: 'bs',
  deathloop: 'dl',
  dishonored: 'dh',
  titanfall: 'tf',
  frostpunk: 'fp',
}

/** Real words that happen to be initials of a run ("dlc" is never "Delicious Last Course"). */
const NEVER_ACRONYMS = new Set(['dlc', 'goty', 'hd'])

/** Shorthand players and catalogues both use; mapped on both sides. */
const WORD_ALIASES: Record<string, string> = {
  versus: 'vs',
  brothers: 'bros',
  civ: 'civilization',
  pkmn: 'pokemon',
  ep: 'episode',
  pt: 'part',
  ch: 'chapter',
  '&': 'and',
  et: 'and',
}

/**
 * Words that carry no identity: articles and prepositions (English + French,
 * the UI is French), "vs"/"and". Never required, never foreign.
 */
const STOP_TOKENS = new Set([
  'the', 'a', 'an', 'of', 'and', 'in', 'on', 'to', 'for', 'at', 'vs',
  'le', 'la', 'les', 'l', 'de', 'du', 'des', 'd', 'un', 'une', 'au', 'aux',
])

/** Structural words around a number ("Part II", "Episode Two"): optional. */
const STRUCTURAL_TOKENS = new Set([
  'part', 'episode', 'chapter', 'vol', 'volume', 'season', 'version', 'ver',
])

/**
 * Edition / re-release suffixes, stripped from the END of a unit only, so
 * "Ocarina of Time 3D" is Ocarina of Time but "Super Mario 3D World" keeps
 * its "3D". Longest phrases first.
 */
const EDITION_PHRASES: string[][] = [
  ['game', 'of', 'the', 'year', 'edition'],
  ['game', 'of', 'the', 'year'],
  ['the', 'definitive', 'edition'],
  ['complete', 'edition'],
  ['legendary', 'edition'],
  ['definitive', 'edition'],
  ['enhanced', 'edition'],
  ['special', 'edition'],
  ['ultimate', 'edition'],
  ['premium', 'edition'],
  ['deluxe', 'edition'],
  ['anniversary', 'edition'],
  ['collectors', 'edition'],
  ['gold', 'edition'],
  ['goty', 'edition'],
  ['directors', 'cut'],
  ['final', 'cut'],
  ['final', 'mix'],
  ['hd', 'remaster'],
  ['hd', 'remastered'],
  ['hd', 'collection'],
  ['the', 'collection'],
  ['remastered'],
  ['remaster'],
  ['remake'],
  ['goty'],
  ['hd'],
  ['3d'],
  ['deluxe'],
  ['royal'],
  ['redux'],
  ['reloaded'],
  ['intergrade'],
  ['fes'],
  ['collection'],
  ['trilogy'],
  ['anthology'],
  ['remix'],
  ['edition'],
]

/** Owner / studio prefixes players leave out ("Sid Meier's Civilization VI"). */
const BRAND_PREFIXES: string[][] = [
  ['sid', 'meiers'],
  ['tom', 'clancys'],
  ['american', 'mcgees'],
  ['ea', 'sports'],
  ['marvels'],
  ['disneys'],
  ['disney'],
  ['lego'],
  ['microsoft'],
]

/**
 * Words so common across game titles that naming only them identifies
 * nothing ("super" fits hundreds of games). A fragment guess needs at least
 * one token outside this list to earn partial credit.
 */
const GENERIC_TITLE_TOKENS = new Set([
  'super', 'new', 'game', 'games', 'world', 'worlds', 'war', 'wars', 'battle',
  'legend', 'legends', 'city', 'dark', 'age', 'star', 'stars', 'online',
  'story', 'adventure', 'adventures', 'tales', 'quest', 'hero', 'heroes',
  'king', 'kingdom', 'space', 'evil', 'life', 'ultimate', 'origins',
  'chronicles', 'saga', 'return', 'rise', 'night', 'dead', 'last', 'lost',
  'black', 'red', 'blue', 'island', 'racing', 'party', 'mega', 'escape',
  'tactics', 'arena', 'collection', 'simulator', 'edition', 'part',
])

/** Subtitle words that mark a DLC / expansion rather than a main entry. */
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

/** Cyrillic look-alikes that slip into catalogue names ("StarСraft"). */
const CONFUSABLES: Record<string, string> = {
  'а': 'a', 'е': 'e', 'о': 'o', 'р': 'p', 'с': 'c', 'х': 'x', 'у': 'y',
  'к': 'k', 'м': 'm', 'т': 't', 'н': 'h', 'в': 'b', 'і': 'i',
}

// ─────────────────────────────────────────────────────────────────────────────
// Normalisation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fold accented letters onto their ASCII base ("Pokémon" -> "Pokemon",
 * "Ragnarök" -> "Ragnarok", "Œuvre" -> "Oeuvre", "Ōkami" -> "Okami") and
 * compatibility forms onto plain letters (fullwidth "ｄｏｏｍ" -> "doom").
 */
function foldDiacritics(text: string): string {
  return text
    .replace(/[™®©°]/g, '')
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .replace(/œ/g, 'oe')
    .replace(/æ/g, 'ae')
    .replace(/ß/g, 'ss')
    .replace(/ø/g, 'o')
    .replace(/đ/g, 'd')
    .replace(/ł/g, 'l')
    .replace(/[а-яії]/g, ch => CONFUSABLES[ch] ?? ch)
}

/**
 * Lowercase, accent-folded, punctuation-free text. Apostrophes are dropped
 * inside a word ("Assassin's" -> "assassins") and a French elision is cut
 * off ("L'Ombre" -> "ombre"); "&" and "+" read as "and"; digit groups keep
 * their value ("40,000" -> "40000"); everything else non-alphanumeric is a
 * separator ("Half-Life" -> "half life", "NieR:Automata" -> "nier automata").
 */
function normalizeText(text: string): string {
  return foldDiacritics(text.toLowerCase())
    .replace(/[’‘ʼ`´]/g, "'")
    .replace(/(^|[^a-z0-9])[ld]'(?=[a-z])/g, '$1')
    .replace(/'/g, '')
    .replace(/(\d)[,.](?=\d{3}(?!\d))/g, '$1')
    .replace(/[&+]/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

type TokenKind = 'word' | 'number' | 'mixed'

interface Token {
  /** Canonical comparable text ("vii" -> "7", "versus" -> "vs"). */
  text: string
  /** Normalised source text, before canonicalisation. */
  raw: string
  kind: TokenKind
  /** Article / preposition: never required, never foreign. */
  stop: boolean
  /** "part", "episode"...: optional on both sides. */
  structural: boolean
  /** Trailing edition suffix of its unit: optional on both sides. */
  edition: boolean
  /** Leading owner prefix of the base ("sid meiers"): optional. */
  brand: boolean
  /** A letter glued after a sequel number ("ff7r"): never required, never foreign. */
  soft: boolean
}

function isNumberText(text: string): boolean {
  return /^\d+$/.test(text)
}

function makeToken(raw: string, index: number, count: number): Token {
  let text = WORD_ALIASES[raw] ?? raw
  // Roman numerals become their value. A lone "i" is far more often the
  // English pronoun ("I Am Setsuna") than a numeral; only a trailing "i"
  // ("The Last of Us Part I") counts.
  const roman = ROMAN_TO_ARABIC[text]
  if (roman !== undefined && (text !== 'i' || (index === count - 1 && index > 0))) {
    text = String(roman)
  } else if (NUMBER_WORDS[text] !== undefined) {
    text = String(NUMBER_WORDS[text])
  } else if (isNumberText(text)) {
    text = String(parseInt(text, 10))
  }
  const kind: TokenKind = isNumberText(text) ? 'number' : /\d/.test(text) ? 'mixed' : 'word'
  return {
    text,
    raw,
    kind,
    stop: kind === 'word' && STOP_TOKENS.has(text),
    structural: kind === 'word' && STRUCTURAL_TOKENS.has(text),
    edition: false,
    brand: false,
    soft: false,
  }
}

/**
 * Split glued shorthand: "witcher3" -> "witcher 3", "ff7" -> "ff 7",
 * "l4d2" -> "l4d 2", "ff7r" -> "ff 7 r" (the trailing letter is soft).
 * A one-letter stem ("x4", "p5r") is left whole and handled as a token.
 */
function splitGlued(raw: string): { raw: string; soft: boolean }[] {
  const m = raw.match(/^([a-z]{2,}|[a-z]\d[a-z])(\d+)([a-z])?$/)
  if (!m) return [{ raw, soft: false }]
  const parts = [{ raw: m[1]!, soft: false }, { raw: m[2]!, soft: false }]
  if (m[3]) parts.push({ raw: m[3], soft: true })
  return parts
}

function tokenizeNormalized(normalized: string): Token[] {
  const raws = normalized.split(' ').filter(Boolean).flatMap(splitGlued)
  return raws.map((r, i) => {
    const tok = makeToken(r.raw, i, raws.length)
    tok.soft = r.soft
    return tok
  })
}

/** Mark a trailing edition suffix ("... Remastered", "... Complete Edition"). */
function markTrailingEdition(tokens: Token[], allowEmpty = false): void {
  let end = tokens.length
  let changed = true
  while (changed && end > 0) {
    changed = false
    for (const phrase of EDITION_PHRASES) {
      if (phrase.length > end) continue
      const slice = tokens.slice(end - phrase.length, end)
      if (slice.every((t, i) => t.raw === phrase[i])) {
        // Keep at least one meaningful token: "Remastered" alone or "The
        // Collection" is the whole name, not a suffix.
        if (!allowEmpty && end - phrase.length === 0) continue
        for (const t of slice) t.edition = true
        end -= phrase.length
        changed = true
        break
      }
    }
    // Generic "<word> Edition" ("DUB Edition", "YoRHa Edition").
    if (!changed && end >= 2 && tokens[end - 1]!.raw === 'edition') {
      tokens[end - 1]!.edition = true
      tokens[end - 2]!.edition = true
      end -= 2
      changed = true
    }
  }
}

/** Mark a leading owner prefix ("Marvel's", "Sid Meier's") as optional. */
function markBrandPrefix(tokens: Token[]): void {
  for (const prefix of BRAND_PREFIXES) {
    if (tokens.length > prefix.length && prefix.every((p, i) => tokens[i]!.raw === p)) {
      for (let i = 0; i < prefix.length; i++) tokens[i]!.brand = true
      return
    }
  }
  // A leading "Super" is Nintendo branding when a real name follows
  // ("Super Mario Odyssey" -> "mario odyssey"), but "Super Metroid" is its
  // own game.
  if (tokens[0]?.raw === 'super' && tokens.filter(t => isRequired(t)).length >= 3) {
    tokens[0].brand = true
  }
}

/** A token that must be covered for a form to be fully named. */
function isRequired(t: Token): boolean {
  return !t.stop && !t.structural && !t.edition && !t.brand && !t.soft
}

/** A word that could, on its own, identify a franchise (not a number, not generic). */
function isDistinctiveWord(t: Token): boolean {
  return isRequired(t) && t.kind === 'word' && t.text.length >= 3 && !GENERIC_TITLE_TOKENS.has(t.text)
}

// ─────────────────────────────────────────────────────────────────────────────
// Title parsing
// ─────────────────────────────────────────────────────────────────────────────

type UnitKind = 'base' | 'alt' | 'subtitle' | 'expansion' | 'paren' | 'year'

interface Unit {
  kind: UnitKind
  tokens: Token[]
}

interface ParsedTarget {
  /** Every unit, aliases included: the pool that explains input words. */
  units: Unit[]
  base: Unit
  subtitles: Unit[]
  expansions: Unit[]
  /** Other variants of the base from "Pokémon X, Y" ("pokemon y"). */
  alts: Unit[]
  parens: Unit[]
  /** Each alias parsed like a title: its subtitle is an entry name too. */
  aliases: ParsedTarget[]
  /** Sequel number closing the base ("The Witcher 3", "Final Fantasy VII"). */
  seriesNumber: number | null
  /** A "Part I" / trailing "I": the first entry, which players name without it. */
  seriesNumberOmittable: boolean
  /** The subtitle names a DLC / expansion of the base game. */
  dlc: boolean
  /** Canonical numbers carried by any unit or alias. */
  numbers: Set<string>
}

function unitOf(kind: UnitKind, text: string, allowEmpty = false): Unit {
  const tokens = tokenizeNormalized(normalizeText(text))
  // A subtitle that is only an edition ("Mass Effect: Legendary Edition")
  // names nothing; a base that is ("Remastered") is the whole name.
  markTrailingEdition(tokens, allowEmpty || kind === 'subtitle' || kind === 'expansion')
  return { kind, tokens }
}

/**
 * "Pokémon X, Y" / "Pokémon Omega Ruby, Alpha Sapphire": a comma-separated
 * list of version names after a shared prefix. Returns the variants, or
 * null when the text is not of that shape.
 */
function commaAlternatives(text: string): string[] | null {
  const parts = text.split(/\s*,\s+/)
  if (parts.length < 2) return null
  const first = parts[0]!.split(/\s+/)
  const rest = parts.slice(1).map(p => p.split(/\s+/))
  const k = rest[0]!.length
  if (k === 0 || k > 2 || rest.some(r => r.length !== k) || first.length <= k) return null
  const prefix = first.slice(0, first.length - k).join(' ')
  return [parts[0]!, ...rest.map(r => `${prefix} ${r.join(' ')}`)]
}

function isLikelyDLC(text: string): boolean {
  const lowered = text.toLowerCase()
  return DLC_KEYWORDS.some(keyword => lowered.includes(keyword))
}

function lastRequiredIndex(tokens: Token[]): number {
  for (let i = tokens.length - 1; i >= 0; i--) {
    if (isRequired(tokens[i]!)) return i
  }
  return -1
}

function parseTarget(gameName: string, aliases: readonly string[], isAlias = false): ParsedTarget {
  // Parenthesised chunks: a year "(2018)" or an alternate name "(Indigo Prophecy)".
  const parens: Unit[] = []
  const years: Unit[] = []
  let rest = gameName.replace(/\(([^)]*)\)/g, (_m, inner: string) => {
    const trimmed = inner.trim()
    if (/^\d{4}$/.test(trimmed)) years.push(unitOf('year', trimmed))
    else if (trimmed) parens.push(unitOf('paren', trimmed))
    return ' '
  })
  rest = rest.replace(/\s+/g, ' ').trim()

  // "Base: Subtitle - Expansion" / "Base + Expansion".
  const dashParts = rest.split(/\s+[-–—+]\s+/).filter(Boolean)
  const core = dashParts[0] ?? rest
  const expansions = dashParts.slice(1).map(p => unitOf('expansion', p))
  const colonParts = core.split(/\s*:\s*/).filter(Boolean)
  const baseText = colonParts[0] ?? core
  const subtitleTexts = colonParts.slice(1)

  const baseVariants = commaAlternatives(baseText) ?? [baseText]
  // An alias that is only an edition word ("HD", "Remake") names nothing.
  const base = unitOf('base', baseVariants[0]!, isAlias)
  markBrandPrefix(base.tokens)
  const alts = baseVariants.slice(1).map(v => unitOf('alt', v))

  const subtitles: Unit[] = []
  for (const text of subtitleTexts) {
    const variants = commaAlternatives(text) ?? [text]
    for (const [i, v] of variants.entries()) {
      subtitles.push(unitOf(i === 0 ? 'subtitle' : 'alt', v))
    }
  }

  // Units that lost every token to edition stripping ("Mass Effect:
  // Legendary Edition") name nothing on their own.
  const live = (u: Unit): boolean => u.tokens.some(isRequired)

  // Sequel number: the last required token of the base, when numeric and small.
  let seriesNumber: number | null = null
  let seriesNumberOmittable = false
  const lastIdx = lastRequiredIndex(base.tokens)
  const lastTok = lastIdx >= 0 ? base.tokens[lastIdx]! : null
  if (lastTok && lastIdx > 0 && lastTok.kind === 'number') {
    const value = parseInt(lastTok.text, 10)
    if (value <= SEQUEL_NUMBER_MAX) {
      seriesNumber = value
      const prev = base.tokens[lastIdx - 1]
      seriesNumberOmittable =
        value === 1 && (lastTok.raw === 'i' || (prev !== undefined && prev.structural))
    }
  }

  // Imported alternative names are noisy: an alias naming another sequel
  // ("GTA 4" on Grand Theft Auto V) must not vouch for this entry.
  const keptAliases = aliases
    .map(a => parseTarget(a, [], true))
    .filter(
      a =>
        live(a.base) &&
        (a.seriesNumber === null || seriesNumber === null || a.seriesNumber === seriesNumber)
    )
  const units = [
    base, ...alts, ...subtitles, ...expansions, ...parens, ...years,
    ...keptAliases.flatMap(a => a.units),
  ]

  const numbers = new Set<string>()
  for (const u of units) for (const t of u.tokens) if (t.kind === 'number') numbers.add(t.text)

  const dlc = [...subtitleTexts, ...dashParts.slice(1)].some(isLikelyDLC)

  return {
    units,
    base,
    subtitles: subtitles.filter(live),
    expansions: expansions.filter(live),
    alts: alts.filter(live),
    parens: parens.filter(live),
    aliases: keptAliases,
    seriesNumber,
    seriesNumberOmittable,
    dlc,
    numbers,
  }
}

function parseInput(input: string): Token[] {
  const tokens = tokenizeNormalized(normalizeText(input.slice(0, MAX_INPUT_LENGTH)))
  // A guess that is only an edition word ("remake", "complete edition")
  // names nothing.
  markTrailingEdition(tokens, true)
  return tokens
}

// ─────────────────────────────────────────────────────────────────────────────
// Word comparison
// ─────────────────────────────────────────────────────────────────────────────

/** Optimal-string-alignment edit distance (insert, delete, substitute, swap). */
function editDistance(a: string, b: string): number {
  const la = a.length
  const lb = b.length
  if (la === 0) return lb
  if (lb === 0) return la
  const d: number[][] = []
  for (let i = 0; i <= la; i++) {
    d.push(new Array<number>(lb + 1).fill(0))
    d[i]![0] = i
  }
  for (let j = 0; j <= lb; j++) d[0]![j] = j
  for (let i = 1; i <= la; i++) {
    for (let j = 1; j <= lb; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      let best = Math.min(d[i - 1]![j]! + 1, d[i]![j - 1]! + 1, d[i - 1]![j - 1]! + cost)
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        best = Math.min(best, d[i - 2]![j - 2]! + 1)
      }
      d[i]![j] = best
    }
  }
  return d[la]![lb]!
}

/**
 * Same word up to a typo. Tolerance scales with length so a short title
 * cannot drift onto a neighbour ("rime" is not "rome", "fe" is not "fez")
 * while "assasins" is "assassins" and "farenheit" is "fahrenheit". A
 * four-letter word tolerates one edit only when the guess carries other
 * words too ("hslo 3", "elden rign"), never on its own. Anything with a
 * digit must be spelled exactly ("2k22" is not "2k23").
 */
function wordsEquivalent(guess: string, word: string, lenient = false): boolean {
  if (guess === word) return true
  if (/\d/.test(guess) || /\d/.test(word)) return false
  const length = Math.max(guess.length, word.length)
  if (length < 4 || (length === 4 && !lenient)) return false
  const limit = length <= 8 ? 1 : 2
  if (Math.abs(guess.length - word.length) > limit) return false
  return editDistance(guess, word) <= limit
}

/**
 * A guess that is a strict prefix of the word is a truncation, not a typo:
 * the player has not finished naming the game. With other words around it
 * a plural "s" is forgiven ("plant vs zombies"), as is a long word missing
 * its last letter ("porta 2"); a lone "hade" or "minecraf" is not.
 */
function isTruncation(guess: string, word: string, inputWords: number): boolean {
  if (!word.startsWith(guess) || guess === word) return false
  if (inputWords < 2) return true
  const missing = word.slice(guess.length)
  if (missing === 's' || missing === 'es') return false
  return word.length < 6
}

/** A short token with at most one vowel reads as shorthand ("botw", "lol"), not a word. */
function isShorthand(text: string): boolean {
  return text.length <= 4 && (text.match(/[aeiouy]/g) ?? []).length <= 1
}

/**
 * "ffviii" is not a typo of "ffvii": when two words differ only in a
 * trailing roman-numeral segment, they name different entries.
 */
function romanTailDiffers(a: string, b: string): boolean {
  let i = 0
  while (i < a.length && i < b.length && a[i] === b[i]) i++
  const tailA = a.slice(i)
  const tailB = b.slice(i)
  return (tailA !== '' || tailB !== '') && /^[ivx]*$/.test(tailA) && /^[ivx]*$/.test(tailB)
}

/**
 * Jaro-Winkler similarity, 0..1. Kept for `calculateSimilarity` /
 * `getBestMatchScore` (ranking, logging) and for the one place the matcher
 * still needs a graded "how close" answer: forgiving a heavily misspelled
 * franchise word when the entry's own name is right.
 */
function jaroWinkler(s1: string, s2: string): number {
  if (s1 === s2) return 1.0
  if (s1.length === 0 || s2.length === 0) return 0.0

  const matchWindow = Math.max(0, Math.floor(Math.max(s1.length, s2.length) / 2) - 1)
  const s1Matches = new Array<boolean>(s1.length).fill(false)
  const s2Matches = new Array<boolean>(s2.length).fill(false)

  let matches = 0
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

  let transpositions = 0
  let k = 0
  for (let i = 0; i < s1.length; i++) {
    if (!s1Matches[i]) continue
    while (!s2Matches[k]) k++
    if (s1[i] !== s2[k]) transpositions++
    k++
  }

  const jaro =
    (matches / s1.length + matches / s2.length + (matches - transpositions / 2) / matches) / 3

  let prefix = 0
  for (let i = 0; i < Math.min(4, s1.length, s2.length); i++) {
    if (s1[i] === s2[i]) prefix++
    else break
  }
  return jaro + prefix * 0.1 * (1 - jaro)
}

// ─────────────────────────────────────────────────────────────────────────────
// Alignment: explaining every word of the guess with the title
// ─────────────────────────────────────────────────────────────────────────────

interface Placed {
  unit: Unit
  index: number
  token: Token
  /** From an alias rather than the title itself. */
  alias: boolean
}

interface Alignment {
  /** Target tokens the guess accounts for. */
  covered: Set<Token>
  /** Guess words the title cannot explain. */
  foreign: Token[]
  /** Guess numbers the title does not carry. */
  wrongNumbers: Token[]
  /** Numbers the guess states (canonical). */
  inputNumbers: Set<string>
  /** Distinctive guess words the title explains. */
  distinctive: Token[]
  /** The whole guess is one two-letter acronym ("ds", "re"): too ambiguous for full credit. */
  shortAcronymOnly: boolean
}

/**
 * Initials of a run: roman numerals and number words keep their letters in
 * the raw variant ("ffvii", "hzd" for Horizon Zero Dawn) and numbers are
 * digits in the canonical one ("l4d", "ff7"); compound franchises add their
 * two-letter initials ("bf1").
 */
function runInitials(run: Token[]): string[] {
  let raw = ''
  let canonical = ''
  let compoundRaw = ''
  let compoundCanonical = ''
  for (const t of run) {
    if (t.kind === 'number') {
      const letters = /^[a-z]+$/.test(t.raw)
        ? ROMAN_TO_ARABIC[t.raw] !== undefined ? t.raw : t.raw[0]!
        : t.text
      raw += letters
      canonical += t.text
      compoundRaw += letters
      compoundCanonical += t.text
    } else {
      const initial = t.text[0] ?? ''
      const compound = COMPOUND_INITIALS[t.text] ?? initial
      raw += initial
      canonical += initial
      compoundRaw += compound
      compoundCanonical += compound
    }
  }
  return [raw, canonical, compoundRaw, compoundCanonical]
}

/**
 * Runs of a unit that an acronym may stand for: from its start, or from its
 * first real word, spanning at least two real words ("go" is not "God of").
 * "The Witcher" / "The Sims" count as a run only when the guess also carries
 * a number ("tw3", "ts4"), so a bare two-letter guess cannot ride an article.
 */
function acronymRuns(unit: Unit, inputNumbers: Set<string>): Token[][] {
  const starts = new Set<number>([0])
  const firstReal = unit.tokens.findIndex(t => !t.stop && !t.brand)
  if (firstReal > 0) starts.add(firstReal)
  const runs: Token[][] = []
  for (const start of starts) {
    const single = unit.tokens[start]
    if (single && COMPOUND_INITIALS[single.text] !== undefined) runs.push([single])
    for (let end = start + 2; end <= unit.tokens.length; end++) {
      const run = unit.tokens.slice(start, end)
      if (run.some(t => t.edition || t.soft)) break
      const real = run.filter(t => !t.stop).length
      if (real < 2) {
        const articled = run.length === 2 && run[0]!.stop && real === 1 && inputNumbers.size > 0
        if (!articled) continue
      }
      runs.push(run)
    }
  }
  return runs
}

function align(input: Token[], target: ParsedTarget): Alignment {
  const placed: Placed[] = []
  const aliasUnits = new Set(target.aliases.flatMap(a => a.units))
  for (const unit of target.units) {
    const alias = aliasUnits.has(unit)
    unit.tokens.forEach((token, index) => placed.push({ unit, index, token, alias }))
  }
  // Acronyms are derived from the title's own units (an alias that is
  // already shorthand must not be shortened again: "r4" is not "RE4"), and
  // may also span the base and its subtitle ("csgo", "codmw2").
  const ownUnits: Unit[] = [
    target.base, ...target.alts, ...target.subtitles, ...target.expansions, ...target.parens,
  ]
  const core: Unit = {
    kind: 'base',
    tokens: [...target.base.tokens, ...target.subtitles.flatMap(u => u.tokens)],
  }
  const acronymUnits = target.subtitles.length > 0 ? [...ownUnits, core] : ownUnits

  const covered = new Set<Token>()
  const foreign: Token[] = []
  const wrongNumbers: Token[] = []
  const inputNumbers = new Set<string>()
  const distinctive: Token[] = []
  let shortAcronyms = 0
  const realInput = input.filter(t => !t.stop && !t.structural && !t.edition && !t.soft)
  // With a second word or a number alongside, a four-letter word may carry
  // a typo; alone it must be spelled out.
  const lenient = realInput.length >= 2
  // Known up front so "the <word>" acronym runs can check for a number.
  for (const t of input) if (t.kind === 'number') inputNumbers.add(t.text)

  // Coverage is by text so the same word in an alias is covered too.
  const coverEqual = (text: string): boolean => {
    let hit = false
    for (const p of placed) {
      if (p.token.text === text) {
        covered.add(p.token)
        hit = true
      }
    }
    return hit
  }
  const findAcronymRun = (text: string): Token[] | null => {
    if (NEVER_ACRONYMS.has(text)) return null
    for (const unit of acronymUnits) {
      for (const run of acronymRuns(unit, inputNumbers)) {
        if (runInitials(run).includes(text)) return run
      }
    }
    return null
  }
  // A letter glued after the number ("fe3h", "p5r") stands for the next
  // word of the title that starts with it.
  const coverInitial = (letter: string): void => {
    const hit = placed.find(
      p => !p.alias && p.token.kind === 'word' && isRequired(p.token) && !covered.has(p.token) && p.token.text.startsWith(letter)
    )
    if (hit) coverEqual(hit.token.text)
  }
  const coverRun = (run: Token[]): void => {
    for (const t of run) {
      coverEqual(t.text)
      if (t.kind === 'number') inputNumbers.add(t.text)
    }
  }

  for (let i = 0; i < input.length; i++) {
    const tok = input[i]!
    if (tok.stop || tok.structural || tok.edition) {
      coverEqual(tok.text)
      continue
    }
    if (tok.kind === 'number') {
      // "mega man x 4": a lone letter and a number spelling a mixed token ("x4").
      const next = input[i + 1]
      if (tok.raw.length === 1 && next?.kind === 'number' && coverEqual(tok.raw + next.text)) {
        inputNumbers.delete(tok.text)
        inputNumbers.delete(next.text)
        i++
        continue
      }
      if (coverEqual(tok.text)) continue
      // "half-life 1" for "Half-Life": the first entry has no number.
      if (tok.text === '1' && target.numbers.size === 0) continue
      wrongNumbers.push(tok)
      continue
    }
    if (tok.soft) {
      coverInitial(tok.text)
      continue
    }
    if (coverEqual(tok.text)) {
      if (isDistinctiveWord(tok) || tok.kind === 'mixed') distinctive.push(tok)
      // A short word equal to an alias token may still be an acronym of the
      // title ("ds" next to the alias "DS1" is Dark Souls).
      if (tok.kind === 'word' && tok.text.length <= 4) {
        const run = findAcronymRun(tok.text)
        if (run) {
          coverRun(run)
          distinctive.push(tok)
          if (tok.text.length === 2) shortAcronyms++
        }
      }
      continue
    }
    if (tok.kind === 'mixed') {
      // "l4d" for "Left 4 Dead": an acronym with a number inside.
      const mixedRun = findAcronymRun(tok.text)
      if (mixedRun) {
        coverRun(mixedRun)
        distinctive.push(tok)
        continue
      }
      // "p5r" / "r6": one letter standing for the franchise's first word.
      // It names the franchise only when the franchise is that one word
      // ("p5" is Persona 5; "r4" is not quite Resident Evil 4).
      const m = tok.text.match(/^([a-z])(\d+)([a-z])?$/)
      const baseWords = target.base.tokens.filter(t => isRequired(t) && t.kind === 'word')
      const first = baseWords[0]
      if (m && first && first.text.startsWith(m[1]!) && target.numbers.has(String(parseInt(m[2]!, 10)))) {
        if (baseWords.length === 1) coverEqual(first.text)
        coverEqual(String(parseInt(m[2]!, 10)))
        inputNumbers.add(String(parseInt(m[2]!, 10)))
        distinctive.push(tok)
        if (m[3]) coverInitial(m[3])
        continue
      }
      // "x2" for "Final Fantasy X-2": a roman numeral glued to a number.
      const r = tok.text.match(/^([ivx]+)(\d+)$/)
      const romanValue = r ? ROMAN_TO_ARABIC[r[1]!] : undefined
      if (r && romanValue !== undefined) {
        const parts = [String(romanValue), String(parseInt(r[2]!, 10))]
        if (parts.every(p => target.numbers.has(p))) {
          for (const p of parts) {
            coverEqual(p)
            inputNumbers.add(p)
          }
          continue
        }
      }
      foreign.push(tok)
      continue
    }

    // A single letter only ever matches itself ("Pokémon Y").
    if (tok.text.length === 1) {
      foreign.push(tok)
      continue
    }

    // Typo-tolerant word match, closest first.
    let best: Placed | null = null
    let bestDistance = Infinity
    for (const p of placed) {
      if (p.token.kind !== 'word' || p.token.text.length === 1) continue
      // Alias shorthand ("BotW", "TW3") must be spelled exactly; a short
      // real word in an alias ("Épée") still tolerates a typo.
      if (p.alias && isShorthand(p.token.text)) continue
      if (!wordsEquivalent(tok.text, p.token.text, lenient)) continue
      if (isTruncation(tok.text, p.token.text, realInput.length)) continue
      if (romanTailDiffers(tok.text, p.token.text)) continue
      const distance = editDistance(tok.text, p.token.text)
      if (distance < bestDistance) {
        best = p
        bestDistance = distance
      }
    }
    if (best) {
      coverEqual(best.token.text)
      if (isDistinctiveWord(tok)) distinctive.push(tok)
      continue
    }

    // Acronym of a run ("gta", "botw", "tlou", "l4d", "ffvii", "csgo").
    const acronymRun = findAcronymRun(tok.text)
    if (acronymRun) {
      coverRun(acronymRun)
      distinctive.push(tok)
      if (tok.text.length === 2) shortAcronyms++
      continue
    }

    // Glued words ("halflife", "eldenring", "stalker" for S.T.A.L.K.E.R.).
    let concatRun: Token[] | null = null
    for (const unit of target.units) {
      for (let start = 0; start < unit.tokens.length && !concatRun; start++) {
        let joined = ''
        for (let end = start; end < unit.tokens.length; end++) {
          const t = unit.tokens[end]!
          if (t.kind !== 'word') break
          joined += t.text
          if (joined.length > tok.text.length + 2) break
          if (end > start && wordsEquivalent(tok.text, joined, lenient)) {
            concatRun = unit.tokens.slice(start, end + 1)
            break
          }
        }
      }
      if (concatRun) break
    }
    if (concatRun) {
      for (const t of concatRun) coverEqual(t.text)
      if (concatRun.some(t => isDistinctiveWord(t))) distinctive.push(tok)
      continue
    }

    // Split word ("star craft" for "StarCraft", "spider man 2" for "Spider-Man 2").
    let consumed = 0
    for (let span = 2; span <= 3 && i + span <= input.length; span++) {
      const slice = input.slice(i, i + span)
      if (slice.some(t => t.kind !== 'word' || t.stop)) break
      const joined = slice.map(t => t.text).join('')
      const hit = placed.find(p => p.token.kind === 'word' && wordsEquivalent(joined, p.token.text, lenient))
      if (hit) {
        coverEqual(hit.token.text)
        if (isDistinctiveWord(hit.token)) distinctive.push(tok)
        consumed = span - 1
        break
      }
    }
    if (consumed > 0) {
      i += consumed
      continue
    }

    foreign.push(tok)
  }

  // Two generic words that stand side by side in the title form a name of
  // their own ("red dead", "star wars"), even though neither does alone.
  if (distinctive.length === 0) {
    for (const unit of target.units) {
      for (let i = 1; i < unit.tokens.length; i++) {
        const a = unit.tokens[i - 1]!
        const b = unit.tokens[i]!
        if (covered.has(a) && covered.has(b) && isGenericWord(a) && isGenericWord(b)) {
          distinctive.push(a, b)
        }
      }
    }
  }

  const shortAcronymOnly = shortAcronyms === 1 && realInput.length === 1

  return { covered, foreign, wrongNumbers, inputNumbers, distinctive, shortAcronymOnly }
}

function isGenericWord(t: Token): boolean {
  return isRequired(t) && t.kind === 'word' && GENERIC_TITLE_TOKENS.has(t.text)
}

// ─────────────────────────────────────────────────────────────────────────────
// Grading
// ─────────────────────────────────────────────────────────────────────────────

export type MatchPrecision = 'exact' | 'partial' | 'none'

export interface MatchResult {
  /** Convenience: `precision !== 'none'`. */
  matched: boolean
  precision: MatchPrecision
}

interface Form {
  kind: 'full' | 'own-name' | 'base'
  tokens: Token[]
}

/** The forms a player may name in full. */
function targetForms(target: ParsedTarget): Form[] {
  const forms: Form[] = []
  const coreTokens = [...target.base.tokens, ...target.subtitles.flatMap(u => u.tokens)]
  forms.push({ kind: 'full', tokens: coreTokens })
  if (target.expansions.length > 0) {
    forms.push({ kind: 'full', tokens: [...coreTokens, ...target.expansions.flatMap(u => u.tokens)] })
  }
  for (const alt of target.alts) forms.push({ kind: 'full', tokens: alt.tokens })
  for (const u of [...target.subtitles, ...target.expansions]) {
    // The entry's own name must be a real name: a phrase, or one word that
    // is not generic ("Reach" yes, "Origins" alone no, "Episode Two" no).
    const words = u.tokens.filter(t => isRequired(t) && t.kind === 'word')
    const distinctive = words.length >= 2 || words.some(isDistinctiveWord)
    if (distinctive) forms.push({ kind: 'own-name', tokens: u.tokens })
  }
  for (const u of target.parens) {
    if (u.tokens.some(t => isRequired(t) && t.kind !== 'number')) {
      forms.push({ kind: 'own-name', tokens: u.tokens })
    }
  }
  // An alias is the entry's own name only when it adds identity of its own:
  // "Pokémon Épée", "GTA 5", "TW3". One that merely repeats part of the base
  // ("Les Sims" on The Sims 4, "Portal" on Portal 2, "Cuphead" on its DLC)
  // is the franchise, and is graded through the base rules. An alias's
  // dash expansion ("… – Blood and Wine" listed on the base game) is a
  // different entry, so only the alias core counts.
  const baseRequired = new Set(target.base.tokens.filter(isRequired).map(t => t.text))
  for (const alias of target.aliases) {
    const core = [...alias.base.tokens, ...alias.subtitles.flatMap(u => u.tokens)]
    const required = core.filter(isRequired)
    const addsIdentity = required.some(t => !baseRequired.has(t.text))
    if (!addsIdentity || !required.some(t => t.kind !== 'number')) continue
    forms.push({ kind: 'own-name', tokens: core })
    // A translated subtitle ("Les Sables du Temps") is the entry's own name
    // when the title has a subtitle to translate; a subtitle the title does
    // not have ("Les Sims 4: Chiens et Chats" listed on The Sims 4) is an
    // expansion listed on the base game.
    const titleHasEntryName = target.subtitles.length > 0 || target.expansions.length > 0
    if (!titleHasEntryName) continue
    for (const u of alias.subtitles) {
      const words = u.tokens.filter(t => isRequired(t) && t.kind === 'word')
      if (words.length >= 2 || words.some(isDistinctiveWord)) {
        forms.push({ kind: 'own-name', tokens: u.tokens })
      }
    }
    for (const alt of alias.alts) forms.push({ kind: 'own-name', tokens: alt.tokens })
  }
  if (target.subtitles.length > 0 || target.expansions.length > 0) {
    forms.push({ kind: 'base', tokens: target.base.tokens })
  }
  return forms
}

function requiredTokens(form: Form, target: ParsedTarget): Token[] {
  return form.tokens.filter(t => {
    if (!isRequired(t)) return false
    // "The Last of Us Part I" is named without its "I".
    if (
      target.seriesNumberOmittable &&
      t.kind === 'number' &&
      target.base.tokens.includes(t) &&
      t.text === String(target.seriesNumber)
    ) {
      return false
    }
    return true
  })
}

function grade(input: Token[], target: ParsedTarget, log: DomainLogger, context: object): MatchPrecision {
  const alignment = align(input, target)
  const { covered, inputNumbers } = alignment
  let { foreign } = alignment

  if (alignment.wrongNumbers.length > 0) {
    log.debug({ ...context, numbers: alignment.wrongNumbers.map(t => t.text) }, 'none: number not in title')
    return 'none'
  }

  const forms = targetForms(target)
  const fullyCovered = (form: Form): boolean => requiredTokens(form, target).every(t => covered.has(t))
  const ownNameCovered = forms.some(f => f.kind === 'own-name' && fullyCovered(f))

  // One heavily misspelled franchise word is forgiven when the entry's own
  // name is right ("grand thieves auto san andreas"): the player clearly
  // identified the game.
  if (foreign.length === 1 && ownNameCovered) {
    const stray = foreign[0]!
    const near = target.units.some(u =>
      u.tokens.some(t => t.kind === 'word' && !covered.has(t) && jaroWinkler(stray.text, t.text) >= 0.7)
    )
    if (near) foreign = []
  }
  if (foreign.length > 0) {
    log.debug({ ...context, foreign: foreign.map(t => t.raw) }, 'none: word not in title')
    return 'none'
  }

  if (forms.some(f => f.kind !== 'base' && fullyCovered(f))) {
    if (alignment.shortAcronymOnly) {
      log.debug(context, 'partial: two-letter acronym alone')
      return 'partial'
    }
    log.debug(context, 'exact: full form named')
    return 'exact'
  }

  // The franchise with its sequel number names the entry ("witcher 3",
  // "sonic 2", "red dead 2"): the leading word of the base (a distinctive
  // one, or two words together) and at least half of the base must be
  // there with the number. Without the number, the player only named the
  // franchise.
  const baseWords = target.base.tokens.filter(t => isRequired(t) && t.kind !== 'number')
  const coveredBaseWords = baseWords.filter(t => covered.has(t))
  const hasSeriesNumber = target.seriesNumber !== null && inputNumbers.has(String(target.seriesNumber))
  const leading = baseWords[0]
  const namesFranchise =
    leading !== undefined &&
    covered.has(leading) &&
    (isDistinctiveWord(leading) || coveredBaseWords.length >= 2) &&
    coveredBaseWords.length * 2 >= baseWords.length
  if (hasSeriesNumber && namesFranchise) {
    log.debug(context, 'exact: franchise + sequel number')
    return 'exact'
  }

  const baseForm = forms.find(f => f.kind === 'base')
  if (baseForm && fullyCovered(baseForm)) {
    // "halo 1" for "Halo: Combat Evolved": on a title that carries no
    // number at all, a "1" names the first entry.
    if (target.numbers.size === 0 && inputNumbers.has('1')) {
      log.debug(context, 'exact: franchise + first entry')
      return 'exact'
    }
    if (target.dlc) {
      // The base game is a different entry from its DLC ("cuphead" for
      // "Cuphead: The Delicious Last Course").
      log.debug(context, 'none: base game named for a DLC')
      return 'none'
    }
    log.debug(context, 'partial: franchise named, entry omitted')
    return 'partial'
  }

  // Every word of the base, number omitted ("the last of us" for "The Last
  // of Us Part II", "left 4 dead" for "Left 4 Dead 2"): the franchise is
  // named even when its words are generic on their own.
  if (baseWords.length > 0 && baseWords.every(t => covered.has(t))) {
    log.debug(context, 'partial: franchise named, number omitted')
    return 'partial'
  }

  if (alignment.distinctive.length > 0) {
    log.debug({ ...context, words: alignment.distinctive.map(t => t.raw) }, 'partial: words of the title')
    return 'partial'
  }
  log.debug(context, 'none: nothing distinctive named')
  return 'none'
}

// ─────────────────────────────────────────────────────────────────────────────
// Structural parse exposed to other services
// ─────────────────────────────────────────────────────────────────────────────

export interface ParsedGameTitle {
  /** Franchise root: the base without its sequel number ("The Witcher"). */
  seriesName: string | null
  seriesNumber: number | null
  subtitle: string | null
  /** Part before the colon, when the title has one. */
  baseName: string | null
  original: string
  normalized: string
}

/**
 * Parse a game title into structured components.
 *
 * - "The Witcher 3: Wild Hunt" -> { seriesName: "the witcher", seriesNumber: 3, subtitle: "Wild Hunt", baseName: "The Witcher 3" }
 * - "Dark Souls III" -> { seriesName: "dark souls", seriesNumber: 3, subtitle: null, baseName: null }
 * - "Warhammer 40,000" -> { seriesName: "warhammer 40000", seriesNumber: null, ... }
 */
function parseGameTitle(title: string): ParsedGameTitle {
  const target = parseTarget(title, [])
  const rootTokens = target.base.tokens.filter(t => isRequired(t) || t.stop)
  const last = rootTokens[rootTokens.length - 1]
  if (last && target.seriesNumber !== null && last.text === String(target.seriesNumber)) {
    rootTokens.pop()
  }
  const seriesName = rootTokens.map(t => t.text).join(' ').trim() || null
  const rawCore = title.replace(/\(([^)]*)\)/g, ' ').split(/\s+[-–—+]\s+/)[0] ?? title
  const colon = rawCore.search(/:\s*/)
  return {
    seriesName,
    seriesNumber: target.seriesNumber,
    subtitle: colon > 0 ? rawCore.slice(colon + 1).trim() || null : null,
    baseName: colon > 0 ? rawCore.slice(0, colon).trim() : null,
    original: title,
    normalized: normalizeText(title),
  }
}

/**
 * Check if two series numbers are compatible: an input without a number is
 * not restrictive; an input with one must match.
 */
function seriesNumbersMatch(inputNum: number | null, targetNum: number | null): boolean {
  if (inputNum === null) return true
  if (targetNum === null) return false
  return inputNum === targetNum
}

// ─────────────────────────────────────────────────────────────────────────────
// Service
// ─────────────────────────────────────────────────────────────────────────────

export interface FuzzyMatchService {
  /** Jaro-Winkler similarity of the normalised strings (ranking / logging only). */
  calculateSimilarity(input: string, target: string): number
  /**
   * Strict acceptance: the guess names the full title (`exact`). Used where a
   * franchise-only answer must not count, e.g. resolving which catalogue game
   * a player named. For graded scoring use `evaluateMatch`.
   */
  isMatch(input: string, gameName: string, aliases?: string[]): boolean
  /**
   * Graded match: `exact` (full title, the entry's own name, or franchise +
   * sequel number), `partial` (franchise or words of the title only) or
   * `none` (wrong number, foreign word, unrelated guess).
   */
  evaluateMatch(input: string, gameName: string, aliases?: string[]): MatchResult
  /** Best Jaro-Winkler score against the title or an alias, for logging. */
  getBestMatchScore(
    input: string,
    gameName: string,
    aliases?: string[]
  ): { bestScore: number; matchedOn: string }
  parseGameTitle: typeof parseGameTitle
  seriesNumbersMatch: typeof seriesNumbersMatch
}

export interface FuzzyMatchServiceDeps {
  logger: DomainLogger
}

export function createFuzzyMatchService(deps: FuzzyMatchServiceDeps): FuzzyMatchService {
  const log = deps.logger.child({ service: 'fuzzy-match' })

  const evaluateMatch = (input: string, gameName: string, aliases: string[] = []): MatchResult => {
    const inputTokens = parseInput(input)
    if (!inputTokens.some(t => !t.stop && !t.structural && !t.edition && !t.soft)) {
      return { matched: false, precision: 'none' }
    }
    const target = parseTarget(gameName, aliases)
    const precision = grade(inputTokens, target, log, { input, gameName })
    return { matched: precision !== 'none', precision }
  }

  return {
    calculateSimilarity(input: string, target: string): number {
      return jaroWinkler(normalizeText(input), normalizeText(target))
    },

    isMatch(input: string, gameName: string, aliases: string[] = []): boolean {
      return evaluateMatch(input, gameName, aliases).precision === 'exact'
    },

    evaluateMatch,

    getBestMatchScore(
      input: string,
      gameName: string,
      aliases: string[] = []
    ): { bestScore: number; matchedOn: string } {
      const normalizedInput = normalizeText(input)
      let bestScore = jaroWinkler(normalizedInput, normalizeText(gameName))
      let matchedOn = gameName
      for (const alias of aliases) {
        const score = jaroWinkler(normalizedInput, normalizeText(alias))
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
