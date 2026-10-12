/**
 * Guess scoring — the points arithmetic for a single classic-mode guess.
 *
 * Extracted from `game.service.submitGuess`, which was a 509-line function
 * that interleaved authorization, anti-replay, anti-oracle, timer validation,
 * persistence, achievements and webhooks with this calculation. The scoring
 * rules carry an explicit ORDERING CONTRACT, and a contract that important
 * deserves to be readable in one screen and testable without a database.
 *
 * The pipeline, in the order the modifiers apply:
 *
 *   1. speed multiplier   BASE_SCORE x 1.0-2.0, by how fast the answer came
 *   2. cap                clamped to MAX_SCREENSHOT_SCORE (200)
 *   3. partial factor     a franchise-only match keeps PARTIAL_MATCH_FACTOR
 *                         of the capped score, so the fastest partial (80)
 *                         can never beat the slowest exact (100)
 *   4. letter penalty     the percentage locked in at reveal time, deducted
 *                         once, on the correct guess
 *   5. second-chance floor  raises the result to SECOND_CHANCE_FLOOR
 *   6. streak bonus       flat points when this answer completes 3, 5 or 10
 *                         consecutive screenshots solved on the first try
 *                         (see calculateStreakBonus). Added LAST, outside
 *                         the 200 cap: a fast player already sits at the
 *                         cap, so a bonus inside it would reward nobody.
 *
 * Order matters at every step. The factor applies AFTER the cap (else a
 * partial could reach 200 x 0.4 from a higher pre-cap number), and the floor
 * applies AFTER the letter penalty so a paid floor still wins over letter
 * costs.
 *
 * Pure: no I/O, no clock, no repositories. The caller fetches the pending
 * letter reveal and second-chance activation and passes what they say.
 */
import type { MatchPrecision } from './fuzzy-match.service.js'

/** Points a correct guess is worth before any modifier. */
export const BASE_SCORE = 100

/** Hard ceiling per screenshot, applied after the speed multiplier. */
export const MAX_SCREENSHOT_SCORE = 200

/**
 * Fraction of the (speed-scaled, capped) score awarded for a `partial` match —
 * the player named the franchise but omitted the sequel number / full subtitle.
 * Deliberately below 0.5 so the FASTEST partial (200 x 0.40 = 80) can never
 * beat the SLOWEST exact (100): full identification is always strictly the
 * better play.
 */
export const PARTIAL_MATCH_FACTOR = 0.4

/**
 * Floor (not a cap, despite the literal PRD wording) applied to the next
 * correct guess on a position where the player activated second chance.
 */
export const SECOND_CHANCE_FLOOR = 70

/**
 * In-game streak tiers: run length -> flat bonus, paid once on the answer
 * that reaches the length. A run of 10 therefore pays 25 + 50 + 100 = 175
 * over the challenge. Highest per-screenshot score becomes 200 + 100 = 300
 * (the 10th screenshot of a perfect run); highest challenge score becomes
 * 2,000 + 175 = 2,175.
 */
export const STREAK_BONUS_TIERS: ReadonlyArray<{ streak: number; bonus: number }> = [
  { streak: 3, bonus: 25 },
  { streak: 5, bonus: 50 },
  { streak: 10, bonus: 100 },
]

export interface StreakBonusInputs {
  /** Position being solved by this guess. */
  position: number
  /** True when no wrong guess was made on this position before this one. */
  firstTry: boolean
  /**
   * Positions of this tier session ALREADY solved on the first try (the
   * current guess excluded).
   */
  firstTrySolvedPositions: ReadonlyArray<number>
}

export interface StreakBonusResult {
  /** Length of the first-try run ending at `position` (0 when not first try). */
  streak: number
  /** Bonus points for that run length (0 when no tier is reached). */
  streakBonus: number
}

/**
 * The streak is a run of CONSECUTIVE POSITIONS solved on the first try,
 * counted backwards from the position being solved. Positional (not
 * chronological) on purpose: the server never sees a skip or a time-out
 * (both are client-side), but it does see that the previous position is not
 * solved, so skipping a hard screenshot breaks the run instead of hiding a
 * miss. Counting backwards only means solving out of order can never pay
 * more than solving in order.
 *
 * A wrong guess on the position breaks the run (the answer is no longer
 * "first try"); a partial (franchise) answer solves the position and counts.
 */
export function calculateStreakBonus(inputs: StreakBonusInputs): StreakBonusResult {
  if (!inputs.firstTry) return { streak: 0, streakBonus: 0 }

  const solved = new Set(inputs.firstTrySolvedPositions)
  let streak = 1
  while (solved.has(inputs.position - streak)) streak++

  const tier = STREAK_BONUS_TIERS.find((t) => t.streak === streak)
  return { streak, streakBonus: tier?.bonus ?? 0 }
}

/**
 * Speed multiplier by time-to-answer. Step function rather than a curve so
 * the tiers are legible to players ("under 3 seconds = double points").
 */
export function calculateSpeedMultiplier(timeTakenMs: number): number {
  const timeTakenSeconds = timeTakenMs / 1000

  if (timeTakenSeconds < 3) {
    return 2.0 // 200 points
  } else if (timeTakenSeconds < 5) {
    return 1.75 // 175 points
  } else if (timeTakenSeconds < 10) {
    return 1.5 // 150 points
  } else if (timeTakenSeconds < 20) {
    return 1.25 // 125 points
  } else {
    return 1.0 // 100 points
  }
}

export interface GuessScoreInputs {
  /** `none` scores zero; `partial` takes the franchise factor. */
  precision: MatchPrecision
  /** Server-authoritative elapsed time for the round. */
  effectiveTimeTakenMs: number
  /**
   * Cumulative letter-reveal penalty percentage locked in at reveal time.
   * 0 when the player revealed nothing (or nothing is pending).
   */
  letterPenaltyPct: number
  /** Whether a second-chance activation is pending for this position. */
  secondChanceActive: boolean
  /**
   * Flat streak bonus from calculateStreakBonus, or 0. The caller passes 0
   * for sessions started before the bonus shipped (no retroactive change).
   */
  streakBonus?: number
}

export interface GuessScoreBreakdown {
  /** Final points banked for this guess. */
  scoreEarned: number
  /** Points removed by the letter-reveal penalty (0 when none). */
  letterPenalty: number
  /**
   * Points the second-chance floor added, or undefined when the floor did
   * not bite (the guess already scored at or above it).
   */
  secondChanceFloorBoost: number | undefined
  /** The multiplier that was applied, for logging and telemetry. */
  speedMultiplier: number
  /** Streak bonus included in scoreEarned (0 when none). */
  streakBonus: number
}

/**
 * Run the scoring pipeline for one guess.
 *
 * A wrong guess scores zero and skips every modifier — there is nothing to
 * discount, and neither a letter reveal nor a second chance is consumed
 * until the position is actually solved.
 */
export function calculateGuessScore(inputs: GuessScoreInputs): GuessScoreBreakdown {
  const { precision, effectiveTimeTakenMs, letterPenaltyPct, secondChanceActive } = inputs
  const streakBonus = inputs.streakBonus ?? 0

  const speedMultiplier = calculateSpeedMultiplier(effectiveTimeTakenMs)

  if (precision === 'none') {
    return {
      scoreEarned: 0,
      letterPenalty: 0,
      secondChanceFloorBoost: undefined,
      speedMultiplier,
      streakBonus: 0,
    }
  }

  // 1 + 2: speed multiplier, then the per-screenshot cap.
  let scoreEarned = Math.min(Math.round(BASE_SCORE * speedMultiplier), MAX_SCREENSHOT_SCORE)

  // 3: franchise-only identification earns a fraction. After the cap, so a
  // partial tops out at 80, never 200.
  if (precision === 'partial') {
    scoreEarned = Math.round(scoreEarned * PARTIAL_MATCH_FACTOR)
  }

  // 4: letter-reveal cost, deducted exactly once on the correct guess.
  let letterPenalty = 0
  if (letterPenaltyPct > 0) {
    letterPenalty = Math.round((scoreEarned * letterPenaltyPct) / 100)
    scoreEarned -= letterPenalty
  }

  // 5: second-chance floor. Last, so a paid floor still wins over letter costs.
  let secondChanceFloorBoost: number | undefined
  if (secondChanceActive && scoreEarned < SECOND_CHANCE_FLOOR) {
    secondChanceFloorBoost = SECOND_CHANCE_FLOOR - scoreEarned
    scoreEarned = SECOND_CHANCE_FLOOR
  }

  // 6: streak bonus. Last and outside the cap, so no other modifier scales it.
  scoreEarned += streakBonus

  return { scoreEarned, letterPenalty, secondChanceFloorBoost, speedMultiplier, streakBonus }
}
