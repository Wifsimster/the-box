import type { DomainLogger } from '../ports/logger.js'


const MAX_INPUT_LENGTH = 200

const SEQUEL_NUMBER_MAX = 99

const ROMAN_TO_ARABIC: Record<string, number> = {
  i: 1, ii: 2, iii: 3, iv: 4, v: 5, vi: 6, vii: 7, viii: 8, ix: 9, x: 10,
  xi: 11, xii: 12, xiii: 13, xiv: 14, xv: 15, xvi: 16, xvii: 17, xviii: 18,
  xix: 19, xx: 20,
}

const NUMBER_WORDS: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7,
  eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
  first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7,
  eighth: 8, ninth: 9, tenth: 10,
  '1st': 1, '2nd': 2, '3rd': 3, '4th': 4, '5th': 5, '6th': 6, '7th': 7,
  '8th': 8, '9th': 9, '10th': 10,
  deux: 2, trois: 3, quatre: 4, cinq: 5, sept: 7, huit: 8, neuf: 9, dix: 10,
}

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

const NEVER_ACRONYMS = new Set(['dlc', 'goty', 'hd'])

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

const STOP_TOKENS = new Set([
  'the', 'a', 'an', 'of', 'and', 'in', 'on', 'to', 'for', 'at', 'vs',
  'le', 'la', 'les', 'l', 'de', 'du', 'des', 'd', 'un', 'une', 'au', 'aux',
])

const STRUCTURAL_TOKENS = new Set([
  'part', 'episode', 'chapter', 'vol', 'volume', 'season', 'version', 'ver',
])

const EDITION_PHRASES: string[][] = [
  ['game', 'of', 'the', 'year', 'edition'],
  ['premium', 'online', 'edition'],
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
  ['golden'],
  ['portable'],
  ['plus'],
  ['vr'],
  ['redux'],
  ['reloaded'],
  ['intergrade'],
  ['fes'],
  ['collection'],
  ['trilogy'],
  ['anthology'],
  ['remix'],
]

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

const GENERIC_TITLE_TOKENS = new Set([
  'super', 'new', 'game', 'games', 'world', 'worlds', 'war', 'wars', 'battle',
  'legend', 'legends', 'city', 'dark', 'age', 'star', 'stars', 'online',
  'story', 'adventure', 'adventures', 'tales', 'quest', 'hero', 'heroes',
  'king', 'kingdom', 'space', 'evil', 'life', 'ultimate', 'origins',
  'chronicles', 'saga', 'return', 'rise', 'night', 'dead', 'last', 'lost',
  'black', 'red', 'blue', 'island', 'racing', 'party', 'mega', 'escape',
  'tactics', 'arena', 'collection', 'simulator', 'edition', 'part',
])

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

const CONFUSABLES: Record<string, string> = {
  'а': 'a', 'е': 'e', 'о': 'o', 'р': 'p', 'с': 'c', 'х': 'x', 'у': 'y',
  'к': 'k', 'м': 'm', 'т': 't', 'н': 'h', 'в': 'b', 'і': 'i',
}

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
  text: string
  raw: string
  kind: TokenKind
  stop: boolean
  structural: boolean
  edition: boolean
  brand: boolean
  soft: boolean
}

function isNumberText(text: string): boolean {
  return /^\d+$/.test(text)
}

function makeToken(raw: string, index: number, raws: string[]): Token {
  let text = WORD_ALIASES[raw] ?? raw
  const count = raws.length
  const last = index === count - 1
  const roman = ROMAN_TO_ARABIC[text]
  const next = index < count - 1 ? raws[index + 1] : undefined
  if (roman !== undefined) {
    const pronoun = text === 'i' && (!last || index === 0)
    const leadingLetter = index === 0 && next !== undefined && !/\d/.test(next)
    if (!pronoun && !leadingLetter) text = String(roman)
  } else if (NUMBER_WORDS[text] !== undefined) {
    text = String(NUMBER_WORDS[text])
  } else if (/^0\d+$/.test(text)) {
    return { text, raw, kind: 'mixed', stop: false, structural: true, edition: false, brand: false, soft: false }
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

function splitGlued(raw: string): { raw: string; soft: boolean }[] {
  const sports = raw.match(/^([a-z]{2,})(\d+k\d*)$/)
  if (sports) return [{ raw: sports[1]!, soft: false }, { raw: sports[2]!, soft: false }]
  const roman = raw.match(/^([b-df-hj-np-tv-z]{2,}?)(ii|iii|iv|vi|vii|viii|ix|xi|xii|xiii|xiv|xv|xvi)$/)
  if (roman) return [{ raw: roman[1]!, soft: false }, { raw: roman[2]!, soft: false }]
  const m = raw.match(/^([a-z]{2,}|[a-z]\d[a-z])(\d+)([a-z])?$/)
  if (!m) return [{ raw, soft: false }]
  const parts = [{ raw: m[1]!, soft: false }, { raw: m[2]!, soft: false }]
  if (m[3]) parts.push({ raw: m[3], soft: true })
  return parts
}

function tokenizeNormalized(normalized: string): Token[] {
  const raws = normalized.split(' ').filter(Boolean).flatMap(splitGlued)
  const texts = raws.map(r => r.raw)
  return raws.map((r, i) => {
    const tok = makeToken(r.raw, i, texts)
    tok.soft = r.soft
    return tok
  })
}

function finalizeTokens(tokens: Token[]): void {
  const live = tokens.filter(t => !t.edition)
  const lastLive = live[live.length - 1]
  if (lastLive && lastLive.raw === 'i' && live.length > 1 && lastLive.kind === 'word') {
    lastLive.text = '1'
    lastLive.kind = 'number'
  }
  if (tokens.filter(isRequired).length >= 3) {
    for (const t of tokens) if (t.text === 'bros') t.structural = true
  }
  const before = live[live.length - 2]
  if (
    lastLive && before && !lastLive.soft &&
    lastLive.kind === 'word' && lastLive.text.length === 1 && before.kind === 'number'
  ) {
    lastLive.structural = true
  }
}

function markTrailingEdition(tokens: Token[], allowEmpty = false): void {
  let end = tokens.length
  let changed = true
  while (changed && end > 0) {
    changed = false
    for (const phrase of EDITION_PHRASES) {
      if (phrase.length > end) continue
      const slice = tokens.slice(end - phrase.length, end)
      if (slice.every((t, i) => t.raw === phrase[i])) {
        if (!allowEmpty && end - phrase.length === 0) continue
        for (const t of slice) t.edition = true
        end -= phrase.length
        changed = true
        break
      }
    }
    if (!changed && end >= 1 && tokens[end - 1]!.raw === 'edition') {
      const span = end >= 2 && !tokens[end - 2]!.stop ? 2 : 1
      for (let i = end - span; i < end; i++) tokens[i]!.edition = true
      end -= span
      changed = true
    }
  }
}

function markBrandPrefix(tokens: Token[]): void {
  for (const prefix of BRAND_PREFIXES) {
    if (tokens.length > prefix.length && prefix.every((p, i) => tokens[i]!.raw === p)) {
      for (let i = 0; i < prefix.length; i++) tokens[i]!.brand = true
      return
    }
  }
  if (tokens[0]?.raw === 'super' && tokens.filter(t => isRequired(t)).length >= 3) {
    tokens[0].brand = true
  }
}

function isRequired(t: Token): boolean {
  return !t.stop && !t.structural && !t.edition && !t.brand && !t.soft
}

function isDistinctiveWord(t: Token): boolean {
  return isRequired(t) && t.kind === 'word' && t.text.length >= 3 && !GENERIC_TITLE_TOKENS.has(t.text)
}

type UnitKind = 'base' | 'alt' | 'subtitle' | 'expansion' | 'paren' | 'year'

interface Unit {
  kind: UnitKind
  tokens: Token[]
}

interface ParsedTarget {
  units: Unit[]
  base: Unit
  subtitles: Unit[]
  expansions: Unit[]
  alts: Unit[]
  parens: Unit[]
  aliases: ParsedTarget[]
  seriesNumber: number | null
  seriesNumberOmittable: boolean
  dlc: boolean
  numbers: Set<string>
  sequelNumbers: Set<string>
  episodeSubtitle: boolean
}

function unitOf(kind: UnitKind, text: string, allowEmpty = false): Unit {
  const tokens = tokenizeNormalized(normalizeText(text))
  markTrailingEdition(tokens, allowEmpty || kind === 'subtitle' || kind === 'expansion')
  finalizeTokens(tokens)
  return { kind, tokens }
}

function commaAlternatives(text: string): string[] | null {
  const slashed = text.split(/\s*\/\s*/)
  const parts =
    slashed.length >= 2 && slashed.every(p => /^[^\d]+$/.test(p))
      ? slashed
      : text.split(/\s*,\s+|\s+(?:&|and|et)\s+/i)
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
  const parens: Unit[] = []
  const years: Unit[] = []
  let rest = gameName.replace(/\(([^)]*)\)/g, (_m, inner: string) => {
    const trimmed = inner.trim()
    if (/^\d{4}$/.test(trimmed)) years.push(unitOf('year', trimmed))
    else if (trimmed) parens.push(unitOf('paren', trimmed))
    return ' '
  })
  rest = rest.replace(/\s+/g, ' ').trim()

  const dashParts = rest.split(/\s+[-–—+]\s+/).filter(Boolean)
  const core = dashParts[0] ?? rest
  const expansions = dashParts.slice(1).map(p => unitOf('expansion', p))
  const colonParts = core.split(/\s*:\s*/).filter(Boolean)
  const baseText = colonParts[0] ?? core
  const subtitleTexts = colonParts.slice(1)

  const baseVariants = commaAlternatives(baseText) ?? [baseText]
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

  const live = (u: Unit): boolean => u.tokens.some(isRequired)

  let seriesNumber: number | null = null
  let seriesNumberOmittable = false
  let lastIdx = lastRequiredIndex(base.tokens)
  if (lastIdx > 0 && base.tokens[lastIdx]!.text.length === 1 && base.tokens[lastIdx]!.kind === 'word') {
    lastIdx = lastRequiredIndex(base.tokens.slice(0, lastIdx))
  }
  const lastTok = lastIdx >= 0 ? base.tokens[lastIdx]! : null
  const beforeLast = lastIdx > 0 ? base.tokens[lastIdx - 1] : undefined
  const compoundTail = beforeLast !== undefined && beforeLast.kind === 'number'
  if (lastTok && lastIdx > 0 && lastTok.kind === 'number' && !compoundTail) {
    const value = parseInt(lastTok.text, 10)
    if (value <= SEQUEL_NUMBER_MAX) {
      seriesNumber = value
      const prev = base.tokens[lastIdx - 1]
      seriesNumberOmittable =
        value === 1 && (lastTok.raw === 'i' || (prev !== undefined && prev.structural))
    }
  }

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
  const sequelNumbers = new Set<string>()
  for (const u of units) {
    if (u.kind === 'year') continue
    for (const t of u.tokens) if (t.kind === 'number') sequelNumbers.add(t.text)
  }
  const episodeSubtitle = subtitles.some(
    u => live(u) && !u.tokens.some(t => isRequired(t) && t.kind === 'word') && u.tokens.some(t => t.kind === 'number')
  )

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
    sequelNumbers,
    episodeSubtitle,
  }
}

function parseInput(input: string): Token[] {
  const tokens = tokenizeNormalized(normalizeText(input.slice(0, MAX_INPUT_LENGTH)))
  markTrailingEdition(tokens, true)
  finalizeTokens(tokens)
  return tokens
}

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

function wordsEquivalent(guess: string, word: string, lenient = false): boolean {
  if (guess === word) return true
  if (/\d/.test(guess) || /\d/.test(word)) return false
  const length = Math.max(guess.length, word.length)
  if (length < 4 || (length === 4 && !lenient)) return false
  const limit = length <= 8 ? 1 : 2
  if (Math.abs(guess.length - word.length) > limit) return false
  return editDistance(guess, word) <= limit
}

function isTruncation(guess: string, word: string, inputWords: number): boolean {
  if (!word.startsWith(guess) || guess === word) return false
  if (inputWords < 2) return true
  const missing = word.slice(guess.length)
  if (missing === 's' || missing === 'es') return false
  return word.length < 6
}

function isShorthand(text: string): boolean {
  return text.length <= 4 && (text.match(/[aeiouy]/g) ?? []).length <= 1
}

function romanTailDiffers(a: string, b: string): boolean {
  let i = 0
  while (i < a.length && i < b.length && a[i] === b[i]) i++
  const tailA = a.slice(i)
  const tailB = b.slice(i)
  return (tailA !== '' || tailB !== '') && /^[ivx]*$/.test(tailA) && /^[ivx]*$/.test(tailB)
}

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

interface Placed {
  unit: Unit
  index: number
  token: Token
  alias: boolean
}

interface Alignment {
  covered: Set<Token>
  foreign: Token[]
  wrongNumbers: Token[]
  inputNumbers: Set<string>
  distinctive: Token[]
  shortAcronymOnly: boolean
  shortAcronyms: boolean
}

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

function acronymRuns(unit: Unit): { run: Token[]; compoundOnly: boolean }[] {
  const starts = new Set<number>([0])
  const firstReal = unit.tokens.findIndex(t => !t.stop && !t.brand)
  if (firstReal > 0) starts.add(firstReal)
  const runs: { run: Token[]; compoundOnly: boolean }[] = []
  const isWord = (t: Token): boolean => !t.stop && t.kind === 'word' && t.text.length >= 2
  for (const start of starts) {
    const single = unit.tokens[start]
    if (single && COMPOUND_INITIALS[single.text] !== undefined) {
      runs.push({ run: [single], compoundOnly: true })
    }
    for (let end = start + 2; end <= unit.tokens.length; end++) {
      const run = unit.tokens.slice(start, end)
      if (run.some(t => t.edition || t.soft)) break
      const words = run.filter(isWord).length
      const compounds = run.filter(t => isWord(t) && COMPOUND_INITIALS[t.text] !== undefined).length
      if (words + compounds < 2) continue
      runs.push({ run, compoundOnly: words < 2 })
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
  const lenient = realInput.length >= 2

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
  const numberBudget = new Map<string, number>()
  for (const p of placed) {
    if (p.token.kind !== 'number') continue
    if (p.alias) numberBudget.set(p.token.text, Math.max(numberBudget.get(p.token.text) ?? 0, 1))
    else numberBudget.set(p.token.text, (numberBudget.get(p.token.text) ?? 0) + (p.unit.kind === 'alt' ? 0 : 1))
  }
  const coverNumber = (text: string): boolean => {
    const budget = numberBudget.get(text) ?? 0
    if (budget <= 0) return false
    numberBudget.set(text, budget - 1)
    return coverEqual(text)
  }
  const findAcronymRun = (text: string): Token[] | null => {
    if (NEVER_ACRONYMS.has(text)) return null
    for (const unit of acronymUnits) {
      for (const { run, compoundOnly } of acronymRuns(unit)) {
        const variants = runInitials(run)
        if ((compoundOnly ? variants.slice(2) : variants).includes(text)) return run
      }
    }
    return null
  }
  const coverInitial = (letter: string): void => {
    const hit = placed.find(
      p => !p.alias && p.token.kind === 'word' && isRequired(p.token) && !covered.has(p.token) && p.token.text.startsWith(letter)
    )
    if (hit) coverEqual(hit.token.text)
  }
  const coverRun = (run: Token[]): void => {
    for (const t of run) {
      if (t.kind === 'number') {
        covered.add(t)
        inputNumbers.add(t.text)
      } else {
        coverEqual(t.text)
      }
    }
  }
  const findGluedRun = (text: string, tolerant: boolean): Token[] | null => {
    for (const unit of target.units) {
      for (let start = 0; start < unit.tokens.length; start++) {
        let joined = ''
        for (let end = start; end < unit.tokens.length; end++) {
          const t = unit.tokens[end]!
          if (!/^[a-z]+$/.test(t.raw)) break
          joined += t.raw
          if (joined.length > text.length + 2) break
          if (joined.length < 4) continue
          if (end > start && (tolerant ? wordsEquivalent(text, joined, lenient) : joined === text)) {
            return unit.tokens.slice(start, end + 1)
          }
        }
      }
    }
    return null
  }

  const deferredNumbers: Token[] = []

  for (let i = 0; i < input.length; i++) {
    const tok = input[i]!
    if (tok.soft) {
      coverInitial(tok.text)
      continue
    }
    if (tok.stop || tok.structural || tok.edition) {
      coverEqual(tok.text)
      continue
    }
    if (tok.kind === 'number') {
      const next = input[i + 1]
      if (tok.raw.length === 1 && next?.kind === 'number' && coverEqual(tok.raw + next.text)) {
        i++
        continue
      }
      deferredNumbers.push(tok)
      continue
    }
    if (coverEqual(tok.text)) {
      if (isDistinctiveWord(tok) || tok.kind === 'mixed') distinctive.push(tok)
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
      const mixedRun = findAcronymRun(tok.text)
      if (mixedRun) {
        coverRun(mixedRun)
        distinctive.push(tok)
        continue
      }
      const m = tok.text.match(/^([a-z])(\d+)([a-z])?$/)
      if (m && lenient) {
        const value = String(parseInt(m[2]!, 10))
        const first = target.base.tokens.find(t => isRequired(t) && t.kind === 'word')
        const spelledNumber = target.base.tokens.some(
          t => t.kind === 'number' && t.text === value && /^[a-z]+$/.test(t.raw)
        )
        const trailingKnown =
          !m[3] || placed.some(p => !p.alias && p.token.kind === 'word' && p.token.text.startsWith(m[3]!))
        if (first && spelledNumber && first.text.startsWith(m[1]!) && trailingKnown) {
          coverEqual(first.text)
          coverNumber(value)
          inputNumbers.add(value)
          distinctive.push(tok)
          if (m[3]) coverInitial(m[3])
          continue
        }
      }
      if (/^\d+k$/.test(tok.text) && placed.some(p => p.token.kind === 'mixed' && p.token.text.startsWith(tok.text))) {
        distinctive.push(tok)
        continue
      }
      const r = tok.text.match(/^([ivx]+)(\d+)$/)
      const romanValue = r ? ROMAN_TO_ARABIC[r[1]!] : undefined
      if (r && romanValue !== undefined) {
        const parts = [String(romanValue), String(parseInt(r[2]!, 10))]
        if (parts.every(p => target.numbers.has(p))) {
          for (const p of parts) {
            coverNumber(p)
            inputNumbers.add(p)
          }
          continue
        }
      }
      foreign.push(tok)
      continue
    }

    if (tok.text.length === 1) {
      foreign.push(tok)
      continue
    }

    const exactGlue = findGluedRun(tok.text, false)
    if (exactGlue) {
      for (const t of exactGlue) coverEqual(t.text)
      distinctive.push(tok)
      continue
    }

    let best: Placed | null = null
    let bestDistance = Infinity
    for (const p of placed) {
      if (p.token.kind !== 'word' || p.token.text.length === 1) continue
      if (p.token.stop || p.token.structural || p.token.edition) continue
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
      if (isDistinctiveWord(best.token)) distinctive.push(tok)
      continue
    }

    const acronymRun = findAcronymRun(tok.text)
    if (acronymRun) {
      coverRun(acronymRun)
      distinctive.push(tok)
      if (tok.text.length === 2) shortAcronyms++
      continue
    }

    const concatRun = findGluedRun(tok.text, true)
    if (concatRun) {
      for (const t of concatRun) coverEqual(t.text)
      if (concatRun.some(t => isDistinctiveWord(t)) || concatRun.filter(isRequired).length >= 2) {
        distinctive.push(tok)
      }
      continue
    }

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

  const coveredIn = (unit: Unit): number => unit.tokens.filter(t => covered.has(t)).length
  for (const tok of deferredNumbers) {
    inputNumbers.add(tok.text)
    const budget = numberBudget.get(tok.text) ?? 0
    const candidates = placed.filter(
      p => p.token.kind === 'number' && p.token.text === tok.text && !covered.has(p.token)
    )
    if (budget <= 0 || candidates.length === 0) {
      if (tok.text === '1' && target.sequelNumbers.size === 0) continue
      wrongNumbers.push(tok)
      continue
    }
    numberBudget.set(tok.text, budget - 1)
    candidates.sort((a, b) => Number(a.alias) - Number(b.alias) || coveredIn(b.unit) - coveredIn(a.unit))
    covered.add(candidates[0]!.token)
    for (const p of placed) {
      if (p.alias && p.token.kind === 'number' && p.token.text === tok.text) covered.add(p.token)
    }
  }

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

  return { covered, foreign, wrongNumbers, inputNumbers, distinctive, shortAcronymOnly, shortAcronyms: shortAcronyms > 0 }
}

function isGenericWord(t: Token): boolean {
  return isRequired(t) && t.kind === 'word' && GENERIC_TITLE_TOKENS.has(t.text)
}

export type MatchPrecision = 'exact' | 'partial' | 'none'

export interface MatchResult {
  matched: boolean
  precision: MatchPrecision
}

interface Form {
  kind: 'full' | 'own-name' | 'base'
  tokens: Token[]
}

function targetForms(target: ParsedTarget): Form[] {
  const forms: Form[] = []
  const coreTokens = [...target.base.tokens, ...target.subtitles.flatMap(u => u.tokens)]
  if (target.expansions.length > 0) {
    forms.push({ kind: 'base', tokens: coreTokens })
    forms.push({ kind: 'full', tokens: [...coreTokens, ...target.expansions.flatMap(u => u.tokens)] })
  } else {
    forms.push({ kind: 'full', tokens: coreTokens })
  }
  for (const alt of target.alts) forms.push({ kind: 'full', tokens: alt.tokens })
  for (const u of [...target.subtitles, ...target.expansions]) {
    const words = u.tokens.filter(t => isRequired(t) && t.kind === 'word')
    const hasNumber = u.tokens.some(t => isRequired(t) && t.kind === 'number')
    const distinctive =
      words.length >= 2 || words.some(isDistinctiveWord) || (words.length === 1 && hasNumber)
    if (distinctive) forms.push({ kind: 'own-name', tokens: u.tokens })
  }
  for (const u of target.parens) {
    if (u.tokens.some(t => isRequired(t) && t.kind !== 'number')) {
      forms.push({ kind: 'own-name', tokens: u.tokens })
    }
  }
  const baseRequired = new Set(target.base.tokens.filter(isRequired).map(t => t.text))
  for (const alias of target.aliases) {
    const core = [...alias.base.tokens, ...alias.subtitles.flatMap(u => u.tokens)]
    const required = core.filter(isRequired)
    const addsIdentity = required.some(t => !baseRequired.has(t.text))
    if (!addsIdentity || !required.some(t => t.kind !== 'number')) continue
    forms.push({ kind: 'own-name', tokens: core })
    for (const alt of alias.alts) forms.push({ kind: 'own-name', tokens: alt.tokens })
    const titleHasEntryName = target.subtitles.length > 0 || target.expansions.length > 0
    if (!titleHasEntryName) continue
    for (const u of alias.subtitles) {
      const words = u.tokens.filter(t => isRequired(t) && t.kind === 'word')
      if (words.length >= 2 || words.some(isDistinctiveWord)) {
        forms.push({ kind: 'own-name', tokens: u.tokens })
      }
    }
  }
  if (target.subtitles.length > 0) {
    forms.push({ kind: 'base', tokens: target.base.tokens })
  }
  return forms
}

function requiredTokens(form: Form, target: ParsedTarget): Token[] {
  return form.tokens.filter(t => {
    if (!isRequired(t)) return false
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
  const fullyCovered = (form: Form): boolean => {
    const required = requiredTokens(form, target)
    return required.length > 0 && required.every(t => covered.has(t))
  }
  const ownNameCovered = forms.some(f => f.kind === 'own-name' && fullyCovered(f))

  if (foreign.length === 1 && ownNameCovered) {
    const stray = foreign[0]!
    const near = target.units.some(u =>
      u.tokens.some(
        t =>
          t.kind === 'word' &&
          !covered.has(t) &&
          t.text[0] === stray.text[0] &&
          jaroWinkler(stray.text, t.text) >= 0.7
      )
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

  const baseWords = target.base.tokens.filter(t => isRequired(t) && t.kind !== 'number')
  const hasSeriesNumber = target.seriesNumber !== null && inputNumbers.has(String(target.seriesNumber))
  if (target.seriesNumber === null && inputNumbers.size > 0 && target.subtitles.length > 0) {
    const subtitleWordNamed = target.subtitles.some(u =>
      u.tokens.some(t => isRequired(t) && t.kind === 'word' && covered.has(t))
    )
    const baseNumbered = target.base.tokens.some(t => t.kind === 'number' && covered.has(t))
    const subtitleLeadsWithNumber = target.subtitles.some(
      u => u.tokens.find(isRequired)?.kind === 'number'
    )
    if (!subtitleWordNamed && !baseNumbered && !subtitleLeadsWithNumber && target.sequelNumbers.size > 0) {
      log.debug(context, 'none: number claimed for the franchise belongs to the subtitle')
      return 'none'
    }
  }

  if (forms.some(f => f.kind === 'base' && fullyCovered(f))) {
    if (hasSeriesNumber && !target.episodeSubtitle) {
      log.debug(context, 'exact: franchise + sequel number')
      return 'exact'
    }
    if (target.dlc) {
      log.debug(context, 'none: base game named for a DLC')
      return 'none'
    }
    log.debug(context, 'partial: franchise named, entry omitted')
    return 'partial'
  }

  if (
    baseWords.length > 0 &&
    baseWords.every(t => covered.has(t)) &&
    baseWords.some(t => t.text.length >= 2)
  ) {
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

export interface ParsedGameTitle {
  seriesName: string | null
  seriesNumber: number | null
  subtitle: string | null
  baseName: string | null
  original: string
  normalized: string
}

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

function seriesNumbersMatch(inputNum: number | null, targetNum: number | null): boolean {
  if (inputNum === null) return true
  if (targetNum === null) return false
  return inputNum === targetNum
}

export interface FuzzyMatchService {
  calculateSimilarity(input: string, target: string): number
  isMatch(input: string, gameName: string, aliases?: string[]): boolean
  evaluateMatch(input: string, gameName: string, aliases?: string[]): MatchResult
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
