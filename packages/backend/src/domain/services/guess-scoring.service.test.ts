import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  BASE_SCORE,
  MAX_SCREENSHOT_SCORE,
  PARTIAL_MATCH_FACTOR,
  SECOND_CHANCE_FLOOR,
  calculateGuessScore,
  calculateSpeedMultiplier,
} from './guess-scoring.service.js'

/** Default inputs: an instant exact answer with no modifiers pending. */
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
    // The ordering matters: 200 (capped) x 0.4 = 80. Applying the factor to
    // the uncapped speed score first would let a partial exceed that.
    const fastest = calculateGuessScore({ ...base, precision: 'partial' })
    assert.equal(fastest.scoreEarned, Math.round(MAX_SCREENSHOT_SCORE * PARTIAL_MATCH_FACTOR))
    assert.equal(fastest.scoreEarned, 80)
  })

  it('keeps the fastest partial strictly below the slowest exact', () => {
    // The property PARTIAL_MATCH_FACTOR exists to guarantee: naming the full
    // title is ALWAYS the better play, however slowly you do it.
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
    // partial first: 200 -> 80, then 25% of 80 = 20.
    const result = calculateGuessScore({
      ...base,
      precision: 'partial',
      letterPenaltyPct: 25,
    })

    assert.equal(result.letterPenalty, 20)
    assert.equal(result.scoreEarned, 60)
  })

  it('raises a low score to the second-chance floor and reports the boost', () => {
    // Slowest exact scores 100; a 90% letter penalty drops it to 10.
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
    // If the floor ran before the penalty, the penalty would eat into it and
    // the player would finish below 70 despite paying for second chance.
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
