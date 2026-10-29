import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  BASE_SCORE,
  MAX_SCREENSHOT_SCORE,
  PARTIAL_MATCH_FACTOR,
  SECOND_CHANCE_FLOOR,
  STREAK_BONUS_TIERS,
  calculateGuessScore,
  calculateSpeedMultiplier,
  calculateStreakBonus,
} from './guess-scoring.service.js'

const base = {
  precision: 'exact' as const,
  effectiveTimeTakenMs: 0,
  letterPenaltyPct: 0,
  secondChanceActive: false,
}

describe('calculateSpeedMultiplier', () => {
  it('steps down through the published tiers', () => {
    assert.equal(calculateSpeedMultiplier(0), 2.0)
    assert.equal(calculateSpeedMultiplier(2_999), 2.0)
    assert.equal(calculateSpeedMultiplier(3_000), 1.75, 'boundary is exclusive-below')
    assert.equal(calculateSpeedMultiplier(4_999), 1.75)
    assert.equal(calculateSpeedMultiplier(5_000), 1.5)
    assert.equal(calculateSpeedMultiplier(9_999), 1.5)
    assert.equal(calculateSpeedMultiplier(10_000), 1.25)
    assert.equal(calculateSpeedMultiplier(19_999), 1.25)
    assert.equal(calculateSpeedMultiplier(20_000), 1.0)
    assert.equal(calculateSpeedMultiplier(10 * 60_000), 1.0, 'never drops below 1x')
  })
})

describe('calculateGuessScore', () => {
  it('scores a wrong guess at zero and consumes no modifier', () => {
    const result = calculateGuessScore({
      ...base,
      precision: 'none',
      letterPenaltyPct: 50,
      secondChanceActive: true,
    })

    assert.equal(result.scoreEarned, 0)
    assert.equal(result.letterPenalty, 0, 'a miss must not burn the letter penalty')
    assert.equal(
      result.secondChanceFloorBoost,
      undefined,
      'a miss must not consume the second chance'
    )
  })

  it('awards the capped maximum for an instant exact answer', () => {
    assert.equal(calculateGuessScore(base).scoreEarned, MAX_SCREENSHOT_SCORE)
  })

  it('awards the base score for a slow exact answer', () => {
    assert.equal(
      calculateGuessScore({ ...base, effectiveTimeTakenMs: 60_000 }).scoreEarned,
      BASE_SCORE
    )
  })

  it('applies the partial factor AFTER the cap', () => {
    const fastest = calculateGuessScore({ ...base, precision: 'partial' })
    assert.equal(fastest.scoreEarned, Math.round(MAX_SCREENSHOT_SCORE * PARTIAL_MATCH_FACTOR))
    assert.equal(fastest.scoreEarned, 80)
  })

  it('keeps the fastest partial strictly below the slowest exact', () => {
    const fastestPartial = calculateGuessScore({
      ...base,
      precision: 'partial',
      effectiveTimeTakenMs: 0,
    })
    const slowestExact = calculateGuessScore({
      ...base,
      precision: 'exact',
      effectiveTimeTakenMs: 10 * 60_000,
    })

    assert.ok(
      fastestPartial.scoreEarned < slowestExact.scoreEarned,
      `fastest partial (${fastestPartial.scoreEarned}) must lose to slowest exact (${slowestExact.scoreEarned})`
    )
  })

  it('deducts the letter penalty as a percentage of the post-cap score', () => {
    const result = calculateGuessScore({ ...base, letterPenaltyPct: 25 })

    assert.equal(result.letterPenalty, 50, '25% of 200')
    assert.equal(result.scoreEarned, 150)
  })

  it('applies the letter penalty to the partial score, not the full one', () => {
    const result = calculateGuessScore({
      ...base,
      precision: 'partial',
      letterPenaltyPct: 25,
    })

    assert.equal(result.letterPenalty, 20)
    assert.equal(result.scoreEarned, 60)
  })

  it('raises a low score to the second-chance floor and reports the boost', () => {
    const result = calculateGuessScore({
      ...base,
      effectiveTimeTakenMs: 60_000,
      letterPenaltyPct: 90,
      secondChanceActive: true,
    })

    assert.equal(result.letterPenalty, 90)
    assert.equal(result.scoreEarned, SECOND_CHANCE_FLOOR)
    assert.equal(result.secondChanceFloorBoost, SECOND_CHANCE_FLOOR - 10)
  })

  it('is a floor, not a cap — a good guess keeps its higher score', () => {
    const result = calculateGuessScore({ ...base, secondChanceActive: true })

    assert.equal(result.scoreEarned, MAX_SCREENSHOT_SCORE)
    assert.equal(result.secondChanceFloorBoost, undefined, 'the floor did not bite')
  })

  it('applies the floor AFTER the letter penalty so a paid floor wins', () => {
    const result = calculateGuessScore({
      ...base,
      effectiveTimeTakenMs: 60_000,
      letterPenaltyPct: 50,
      secondChanceActive: true,
    })

    assert.ok(
      result.scoreEarned >= SECOND_CHANCE_FLOOR,
      'second chance must guarantee the floor even with letters revealed'
    )
    assert.equal(result.scoreEarned, SECOND_CHANCE_FLOOR)
  })

  it('never returns a negative score even at a 100% letter penalty', () => {
    const result = calculateGuessScore({ ...base, letterPenaltyPct: 100 })

    assert.equal(result.scoreEarned, 0)
    assert.ok(result.scoreEarned >= 0)
  })

  it('reports the speed multiplier it used', () => {
    assert.equal(calculateGuessScore({ ...base, effectiveTimeTakenMs: 4_000 }).speedMultiplier, 1.75)
    assert.equal(
      calculateGuessScore({ ...base, precision: 'none', effectiveTimeTakenMs: 4_000 }).speedMultiplier,
      1.75,
      'still reported for a miss, for telemetry'
    )
  })
})

describe('calculateStreakBonus', () => {
  const runInOrder = (n: number) => {
    const solved: number[] = []
    const bonuses: number[] = []
    for (let position = 1; position <= n; position++) {
      bonuses.push(
        calculateStreakBonus({ position, firstTry: true, firstTrySolvedPositions: solved })
          .streakBonus
      )
      solved.push(position)
    }
    return bonuses
  }

  it('publishes the 3 / 5 / 10 tiers', () => {
    assert.deepEqual(STREAK_BONUS_TIERS, [
      { streak: 3, bonus: 25 },
      { streak: 5, bonus: 50 },
      { streak: 10, bonus: 100 },
    ])
  })

  it('pays each tier once, on the answer that reaches it', () => {
    assert.deepEqual(runInOrder(10), [0, 0, 25, 0, 50, 0, 0, 0, 0, 100])
  })

  it('caps a perfect challenge at 175 bonus points', () => {
    assert.equal(runInOrder(10).reduce((a, b) => a + b, 0), 175)
  })

  it('reports the run length', () => {
    const r = calculateStreakBonus({ position: 4, firstTry: true, firstTrySolvedPositions: [1, 2, 3] })
    assert.deepEqual(r, { streak: 4, streakBonus: 0 })
  })

  it('pays nothing when the answer is not the first try, and the run resets', () => {
    assert.deepEqual(
      calculateStreakBonus({ position: 3, firstTry: false, firstTrySolvedPositions: [1, 2] }),
      { streak: 0, streakBonus: 0 }
    )
    assert.equal(
      calculateStreakBonus({ position: 4, firstTry: true, firstTrySolvedPositions: [1, 2] }).streak,
      1
    )
  })

  it('breaks the run on a skipped (unsolved) position', () => {
    assert.equal(
      calculateStreakBonus({ position: 5, firstTry: true, firstTrySolvedPositions: [1, 2, 4] })
        .streakBonus,
      0
    )
  })

  it('counts backwards only, so solving out of order never pays more', () => {
    const order = [4, 5, 1, 2, 3]
    const solved: number[] = []
    let total = 0
    for (const position of order) {
      total += calculateStreakBonus({ position, firstTry: true, firstTrySolvedPositions: solved })
        .streakBonus
      solved.push(position)
    }
    assert.equal(total, 25)
    assert.ok(total <= runInOrder(5).reduce((a, b) => a + b, 0))
  })
})

describe('calculateGuessScore — streak bonus and cap', () => {
  it('adds the bonus after the 200 cap', () => {
    const r = calculateGuessScore({ ...base, streakBonus: 100 })
    assert.equal(r.scoreEarned, MAX_SCREENSHOT_SCORE + 100)
    assert.equal(r.streakBonus, 100)
  })

  it('never exceeds 300 per screenshot (200 cap + largest tier)', () => {
    const maxTier = Math.max(...STREAK_BONUS_TIERS.map((t) => t.bonus))
    const r = calculateGuessScore({ ...base, streakBonus: maxTier })
    assert.equal(r.scoreEarned, 300)
  })

  it('is not scaled by the partial factor or the letter penalty', () => {
    const r = calculateGuessScore({
      ...base,
      precision: 'partial',
      letterPenaltyPct: 50,
      streakBonus: 25,
    })
    assert.equal(r.scoreEarned, 65)
  })

  it('applies after the second-chance floor', () => {
    const r = calculateGuessScore({
      ...base,
      precision: 'partial',
      effectiveTimeTakenMs: 20_000,
      secondChanceActive: true,
      streakBonus: 25,
    })
    assert.equal(r.scoreEarned, SECOND_CHANCE_FLOOR + 25)
  })

  it('is ignored on a wrong guess', () => {
    const r = calculateGuessScore({ ...base, precision: 'none', streakBonus: 100 })
    assert.equal(r.scoreEarned, 0)
    assert.equal(r.streakBonus, 0)
  })

  it('defaults to no bonus when the caller omits it', () => {
    assert.equal(calculateGuessScore(base).scoreEarned, MAX_SCREENSHOT_SCORE)
  })
})
