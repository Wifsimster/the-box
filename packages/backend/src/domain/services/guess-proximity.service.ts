import type { Game, GuessProximityHint } from '@the-box/types'

export interface ProximityAnswer {
  id: number
  name: string
  developer?: string
  publisher?: string
}

export interface ProximityFuzzyMatcher {
  evaluateMatch(input: string, gameName: string, aliases?: string[]): { matched: boolean }
  parseGameTitle(title: string): { seriesName: string | null; baseName: string | null }
}

export interface ComputeGuessProximityInput {
  guessText: string
  answer: ProximityAnswer
  candidates: Game[]
  fuzzyMatch: ProximityFuzzyMatcher
}

function normalizeText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function sameOrg(a: string | undefined, b: string | undefined): boolean {
  if (!a || !b) return false
  const na = normalizeText(a)
  const nb = normalizeText(b)
  return na.length > 0 && na === nb
}

function franchiseLabel(name: string): string {
  const colon = name.indexOf(':')
  const base = colon > 0 ? name.slice(0, colon) : name
  return base.replace(/\s+(\d+|[ivxlcdm]+)$/i, '').trim() || base.trim()
}

function franchiseKey(name: string, fuzzy: ProximityFuzzyMatcher): string | null {
  const parsed = fuzzy.parseGameTitle(name)
  const root = parsed.seriesName ?? parsed.baseName
  if (!root) return null
  const key = normalizeText(root)
  return key.length >= 3 ? key : null
}

export function computeGuessProximityHint(
  input: ComputeGuessProximityInput
): GuessProximityHint | null {
  const { guessText, answer, candidates, fuzzyMatch } = input
  if (!guessText.trim() || candidates.length === 0) return null

  let matched: Game | undefined
  for (const candidate of candidates) {
    if (candidate.id === answer.id) continue
    if (fuzzyMatch.evaluateMatch(guessText, candidate.name, candidate.aliases ?? []).matched) {
      matched = candidate
      break
    }
  }
  if (!matched) return null

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
