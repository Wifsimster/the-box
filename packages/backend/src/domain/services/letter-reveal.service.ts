// Masked-title letter reveal — pure functions, no infra deps.
//
// The game's title IS the answer, so unlike the metadata hints (which only
// reveal after a correct guess) this feature leaks a controlled prefix of
// the secret BEFORE the position is solved. Everything here is therefore
// deliberately deterministic and server-side only:
//
//   - The mask is a pure function of (gameName, lettersRevealed). We store
//     only the integer reveal count per (tier_session, position) and
//     recompute the string on every call — idempotent and replay-safe by
//     construction. The full title never reaches the client.
//   - `maxRevealableLetters` caps the leak at min(2, ceil(maskable × 0.3))
//     so the revealed prefix can NEVER satisfy the lenient fuzzy matcher
//     on its own (prefix paths, acronyms, 0.85 length-ratio). The unit
//     test pinning this against the real fuzzy-match service is the ship
//     gate for the feature — see letter-reveal.service.test.ts.
//
// Masking rules (player-facing contract, mirrored in docs/game-flow.md):
//   - Nothing ships before the first paid reveal: even the skeleton ("word
//     count + lengths") is a strong clue, so game.service sends an empty
//     mask until lettersRevealed > 0.
//   - Once a reveal has been paid, structural characters come free with it:
//     spaces, digits, punctuation — they define the skeleton.
//   - A leading article (The/A/An/Le/La/Les/L') is free too — burning a
//     paid reveal on "T" of "The ..." would be a scam.
//   - Every other letter (Unicode-aware, diacritics included) is masked as
//     `_` and revealed left-to-right, one per paid reveal.

const MASK_CHAR = '_'

// Leading articles auto-revealed for free (en + fr — titles are proper
// nouns and not localized, but French players guess French-released games
// whose titles legitimately start with Le/La/Les).
const LEADING_ARTICLE = /^(?:(?:the|an|a|les|le|la)(?=\s)|l')/i

// Convex per-letter score penalty, percent of the round's earned score.
// Letter 1 costs 15%, letter 2 adds 20% (cumulative 35%). More expensive
// than the flat 20% metadata hints because a title prefix is categorically
// stronger help. Applied after the 200-point cap, before the
// second-chance floor (see game.service.submitGuess).
export const LETTER_PENALTY_STEPS = [15, 20] as const

interface MaskPlan {
  /** Per-character render plan; `maskIndex` is -1 for free characters. */
  chars: Array<{ char: string; maskIndex: number }>
  /** Number of maskable (paid-reveal) letters in the title. */
  maskableCount: number
}

const isLetter = (ch: string): boolean => /\p{L}/u.test(ch)
const isDigit = (ch: string): boolean => /\d/.test(ch)

/**
 * Classify every character of the title once; masking for any reveal count
 * is then a single pass over the plan.
 */
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
    // Digit-only titles ("2048"): with no letters to mask, the "free
    // structural digits" rule would print the whole answer in the
    // skeleton. Re-classify digits as maskable instead.
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

/**
 * Hard cap on paid reveals for a title. min(2, ceil(maskable × 0.3)):
 * 1–3 maskable letters → 1 reveal, 4+ → 2. Two leading letters of a
 * multi-word title sit far below every fuzzy-match threshold; short
 * titles get a single letter so "Ico"/"Doom" are never half-spelled.
 */
export function maxRevealableLetters(gameName: string): number {
  const { maskableCount } = buildMaskPlan(gameName)
  if (maskableCount === 0) return 0
  return Math.min(2, Math.ceil(maskableCount * 0.3))
}

/**
 * Render the masked title with the first `lettersRevealed` maskable
 * letters shown. Counts beyond the cap are clamped so a stale or
 * malicious count can never widen the leak.
 */
export function buildMaskedTitle(gameName: string, lettersRevealed: number): string {
  const plan = buildMaskPlan(gameName)
  const revealed = Math.max(0, Math.min(lettersRevealed, maxRevealableLetters(gameName)))
  return plan.chars
    .map(({ char, maskIndex }) =>
      maskIndex === -1 || maskIndex < revealed ? char : MASK_CHAR
    )
    .join('')
}

/**
 * The exact prefix a player has been shown after `lettersRevealed` paid
 * reveals — i.e. only the revealed + free characters, with every still-
 * masked letter stripped. This is the worst-case string an abuser could
 * feed the fuzzy matcher; the ship-gate test asserts it never matches.
 */
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

/** Cumulative penalty percent after `lettersRevealed` paid reveals. */
export function penaltyPctForReveals(lettersRevealed: number): number {
  let total = 0
  for (let i = 0; i < lettersRevealed && i < LETTER_PENALTY_STEPS.length; i++) {
    total += LETTER_PENALTY_STEPS[i]!
  }
  return total
}

/** Penalty the next reveal would add, or null when `lettersRevealed` hit the cap. */
export function nextPenaltyPct(maxLetters: number, lettersRevealed: number): number | null {
  if (lettersRevealed >= maxLetters) return null
  return LETTER_PENALTY_STEPS[Math.min(lettersRevealed, LETTER_PENALTY_STEPS.length - 1)]!
}

/**
 * Effective reveal cap for a title, verified against the SAME matcher that
 * scores guesses. The static formula alone is not safe: "Do" already
 * fuzzy-matches "Doom" (subtitle threshold 0.85) and the free article in
 * "La Mu___" hands Jaro-Winkler a long shared prefix against "La Mulana".
 * Walking up from zero and stopping before the first fragment the matcher
 * would accept makes the no-leak property hold BY CONSTRUCTION — a future
 * matcher tweak can shrink a title's cap but can never open a leak.
 */
export function effectiveMaxReveals(
  gameName: string,
  isMatch: (input: string, gameName: string) => boolean
): number {
  const staticMax = maxRevealableLetters(gameName)
  let safe = 0
  while (safe < staticMax) {
    const fragment = revealedFragment(gameName, safe + 1)
    if (fragment !== '' && isMatch(fragment, gameName)) break
    safe++
  }
  return safe
}
