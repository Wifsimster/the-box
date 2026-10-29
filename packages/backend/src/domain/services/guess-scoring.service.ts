import type { MatchPrecision } from './fuzzy-match.service.js'

export const BASE_SCORE = 100

export const MAX_SCREENSHOT_SCORE = 200

export const PARTIAL_MATCH_FACTOR = 0.4

export const SECOND_CHANCE_FLOOR = 70

export const STREAK_BONUS_TIERS: ReadonlyArray<{ streak: number; bonus: number }> = [
  { streak: 3, bonus: 25 },
  { streak: 5, bonus: 50 },
  { streak: 10, bonus: 100 },
]

export interface StreakBonusInputs {
  position: number
  firstTry: boolean
  firstTrySolvedPositions: ReadonlyArray<number>
}

export interface StreakBonusResult {
  streak: number
  streakBonus: number
}

export function calculateStreakBonus(inputs: StreakBonusInputs): StreakBonusResult {
  if (!inputs.firstTry) return { streak: 0, streakBonus: 0 }

  const solved = new Set(inputs.firstTrySolvedPositions)
  let streak = 1
  while (solved.has(inputs.position - streak)) streak++

  const tier = STREAK_BONUS_TIERS.find((t) => t.streak === streak)
  return { streak, streakBonus: tier?.bonus ?? 0 }
}

export function calculateSpeedMultiplier(timeTakenMs: number): number {
  const timeTakenSeconds = timeTakenMs / 1000

  if (timeTakenSeconds < 3) {
    return 2.0
  } else if (timeTakenSeconds < 5) {
    return 1.75
  } else if (timeTakenSeconds < 10) {
    return 1.5
  } else if (timeTakenSeconds < 20) {
    return 1.25
  } else {
    return 1.0
  }
}

export interface GuessScoreInputs {
  precision: MatchPrecision
  effectiveTimeTakenMs: number
  letterPenaltyPct: number
  secondChanceActive: boolean
  streakBonus?: number
}

export interface GuessScoreBreakdown {
  scoreEarned: number
  letterPenalty: number
  secondChanceFloorBoost: number | undefined
  speedMultiplier: number
  streakBonus: number
}

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

  let scoreEarned = Math.min(Math.round(BASE_SCORE * speedMultiplier), MAX_SCREENSHOT_SCORE)

  if (precision === 'partial') {
    scoreEarned = Math.round(scoreEarned * PARTIAL_MATCH_FACTOR)
  }

  let letterPenalty = 0
  if (letterPenaltyPct > 0) {
    letterPenalty = Math.round((scoreEarned * letterPenaltyPct) / 100)
    scoreEarned -= letterPenalty
  }

  let secondChanceFloorBoost: number | undefined
  if (secondChanceActive && scoreEarned < SECOND_CHANCE_FLOOR) {
    secondChanceFloorBoost = SECOND_CHANCE_FLOOR - scoreEarned
    scoreEarned = SECOND_CHANCE_FLOOR
  }

  scoreEarned += streakBonus

  return { scoreEarned, letterPenalty, secondChanceFloorBoost, speedMultiplier, streakBonus }
}
