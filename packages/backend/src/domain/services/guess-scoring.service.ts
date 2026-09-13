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

  const speedMultiplier = calculateSpeedMultiplier(effectiveTimeTakenMs)

  if (precision === 'none') {
    return {
      scoreEarned: 0,
      letterPenalty: 0,
      secondChanceFloorBoost: undefined,
      speedMultiplier,
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

  return { scoreEarned, letterPenalty, secondChanceFloorBoost, speedMultiplier }
}
