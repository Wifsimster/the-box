const MASK_CHAR = '_'

const LEADING_ARTICLE = /^(?:(?:the|an|a|les|le|la)(?=\s)|l')/i

export const LETTER_PENALTY_STEPS = [15, 20] as const

interface MaskPlan {
  chars: Array<{ char: string; maskIndex: number }>
  maskableCount: number
}

const isLetter = (ch: string): boolean => /\p{L}/u.test(ch)
const isDigit = (ch: string): boolean => /\d/.test(ch)

function buildMaskPlan(gameName: string): MaskPlan {
  const articleMatch = gameName.match(LEADING_ARTICLE)
  const freePrefixLength = articleMatch ? articleMatch[0].length : 0

  const chars: MaskPlan['chars'] = []
  let maskIndex = 0
  for (let i = 0; i < gameName.length; i++) {
    const char = gameName[i]!
    if (i < freePrefixLength || !isLetter(char)) {
      chars.push({ char, maskIndex: -1 })
    } else {
      chars.push({ char, maskIndex })
      maskIndex++
    }
  }

  if (maskIndex === 0) {
    const digitChars: MaskPlan['chars'] = []
    let digitIndex = 0
    for (const { char } of chars) {
      if (isDigit(char)) {
        digitChars.push({ char, maskIndex: digitIndex })
        digitIndex++
      } else {
        digitChars.push({ char, maskIndex: -1 })
      }
    }
    return { chars: digitChars, maskableCount: digitIndex }
  }

  return { chars, maskableCount: maskIndex }
}

export function maxRevealableLetters(gameName: string): number {
  const { maskableCount } = buildMaskPlan(gameName)
  if (maskableCount === 0) return 0
  return Math.min(2, Math.ceil(maskableCount * 0.3))
}

export function buildMaskedTitle(gameName: string, lettersRevealed: number): string {
  const plan = buildMaskPlan(gameName)
  const revealed = Math.max(0, Math.min(lettersRevealed, maxRevealableLetters(gameName)))
  return plan.chars
    .map(({ char, maskIndex }) =>
      maskIndex === -1 || maskIndex < revealed ? char : MASK_CHAR
    )
    .join('')
}

export function revealedFragment(gameName: string, lettersRevealed: number): string {
  const plan = buildMaskPlan(gameName)
  const revealed = Math.max(0, Math.min(lettersRevealed, maxRevealableLetters(gameName)))
  return plan.chars
    .filter(({ maskIndex }) => maskIndex === -1 || maskIndex < revealed)
    .map(({ char }) => char)
    .join('')
    .replace(/\s+/g, ' ')
    .trim()
}

export function penaltyPctForReveals(lettersRevealed: number): number {
  let total = 0
  for (let i = 0; i < lettersRevealed && i < LETTER_PENALTY_STEPS.length; i++) {
    total += LETTER_PENALTY_STEPS[i]!
  }
  return total
}

export function nextPenaltyPct(maxLetters: number, lettersRevealed: number): number | null {
  if (lettersRevealed >= maxLetters) return null
  return LETTER_PENALTY_STEPS[Math.min(lettersRevealed, LETTER_PENALTY_STEPS.length - 1)]!
}

export function effectiveMaxReveals(
  gameName: string,
  isMatch: (input: string, gameName: string) => boolean
): number {
  const staticMax = maxRevealableLetters(gameName)
  let safe = 0
  while (safe < staticMax) {
    const fragment = revealedFragment(gameName, safe + 1)
    if (fragmentVariants(fragment).some(v => isMatch(v, gameName))) break
    safe++
  }
  return safe
}

export function fragmentVariants(fragment: string): string[] {
  const trimmed = fragment.trim()
  if (trimmed === '') return []
  const noArticle = trimmed.replace(LEADING_ARTICLE, '').trim()
  const variants = new Set<string>([trimmed, trimmed.replace(/\s+/g, '')])
  if (noArticle !== '' && noArticle !== trimmed) {
    variants.add(noArticle)
    variants.add(noArticle.replace(/\s+/g, ''))
  }
  return [...variants]
}
