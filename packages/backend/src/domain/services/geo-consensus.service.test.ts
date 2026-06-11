import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import type { GeoPinConfidence } from '@the-box/types'
import {
  evaluateConsensus,
  grantsForAcceptedPin,
  GEO_CONSENSUS_CONFIDENCE_WEIGHTS,
  GEO_CONSENSUS_MIN_PINS_TO_PROMOTE,
  GEO_CONSENSUS_VERSION,
  type GeoPinLike,
} from './geo-consensus.service.js'

const RADIUS = 0.05

function pin(id: number, x: number, y: number, confidence?: GeoPinConfidence): GeoPinLike {
  return confidence == null ? { id, pin: { x, y } } : { id, pin: { x, y }, confidence }
}

describe('evaluateConsensus', () => {
  it('returns zeros for empty input', () => {
    const out = evaluateConsensus([], RADIUS)
    assert.equal(out.acceptedCount, 0)
    assert.equal(out.rejectedCount, 0)
    assert.equal(out.promote, false)
    assert.equal(out.confidence, 0)
    assert.equal(out.version, GEO_CONSENSUS_VERSION)
    assert.deepEqual(out.decisions, [])
  })

  it('handles a single pin: accepts (sigma=0 short-circuit) but does not promote', () => {
    // n=1 → σ=0 on both axes. The σ-cutoff branch is short-circuited via
    // the `cutoff > 0` guard so the lone pin is ACCEPTED (it's literally
    // the centroid). It still doesn't promote because we require
    // GEO_CONSENSUS_MIN_PINS_TO_PROMOTE accepted pins.
    const out = evaluateConsensus([pin(1, 0.5, 0.5)], RADIUS)
    assert.equal(out.acceptedCount, 1)
    assert.equal(out.rejectedCount, 0)
    assert.equal(out.promote, false)
    assert.equal(out.sigmaX, 0)
    assert.equal(out.sigmaY, 0)
  })

  it('all-identical pins: σ=0, all accepted, confidence=1', () => {
    // Same point repeated — sigma is 0 on both axes, distance is 0, so
    // every pin sits inside the (zero) σ-cutoff (guarded by cutoff > 0)
    // AND inside the consensus radius. Confidence = 1 - 0/RADIUS = 1.
    const pins = Array.from({ length: 7 }, (_, i) => pin(i + 1, 0.42, 0.31))
    const out = evaluateConsensus(pins, RADIUS)
    assert.equal(out.acceptedCount, 7)
    assert.equal(out.rejectedCount, 0)
    assert.ok(out.confidence > 0.999)
    assert.equal(out.promote, true)
  })

  it('promotes exactly at the minimum-pins threshold (5 accepted, tight cluster)', () => {
    // Exactly GEO_CONSENSUS_MIN_PINS_TO_PROMOTE pins, all very close
    // → confidence well above 0.5 → promote.
    const pins: GeoPinLike[] = [
      pin(1, 0.5, 0.5),
      pin(2, 0.5005, 0.5005),
      pin(3, 0.499, 0.5),
      pin(4, 0.5, 0.499),
      pin(5, 0.5005, 0.499),
    ]
    assert.equal(pins.length, GEO_CONSENSUS_MIN_PINS_TO_PROMOTE)
    const out = evaluateConsensus(pins, RADIUS)
    assert.equal(out.acceptedCount, 5)
    assert.equal(out.promote, true)
  })

  it('does not promote when pin spread exceeds the radius', () => {
    // Pins spread across the whole map: sigma ≈ 0.4, radius is 0.05,
    // confidence floors at 0 → no promotion regardless of count.
    const pins: GeoPinLike[] = [
      pin(1, 0.05, 0.05),
      pin(2, 0.95, 0.05),
      pin(3, 0.05, 0.95),
      pin(4, 0.95, 0.95),
      pin(5, 0.5, 0.5),
      pin(6, 0.0, 0.0),
    ]
    const out = evaluateConsensus(pins, RADIUS)
    assert.equal(out.promote, false)
    assert.ok(out.confidence < 0.5)
  })

  it('rejects pins outside the consensus radius', () => {
    // Tight cluster of 4 + one obvious outlier far away. σ-cutoff catches
    // the outlier on the X axis; even if sigma allows it, the radius gate
    // is also tripped.
    const pins: GeoPinLike[] = [
      pin(1, 0.5, 0.5),
      pin(2, 0.501, 0.501),
      pin(3, 0.499, 0.5),
      pin(4, 0.5, 0.499),
      pin(5, 0.95, 0.5), // outlier
    ]
    const out = evaluateConsensus(pins, RADIUS)
    const outlierDecision = out.decisions.find((d) => d.pinId === 5)!
    assert.equal(outlierDecision.status, 'rejected')
    assert.ok(out.rejectedCount >= 1)
  })

  it('emits the current algorithm version on every result', () => {
    // Bumping GEO_CONSENSUS_VERSION lets the worker tell old vs new
    // decisions apart on a retroactive re-run.
    const out = evaluateConsensus([pin(1, 0.5, 0.5)], RADIUS)
    assert.equal(out.version, GEO_CONSENSUS_VERSION)
  })

  it('confidence weights pull the centroid toward the "sure" pin', () => {
    // Three pins on a horizontal line. The lone "sure" (weight 1.0)
    // pin sits at x=0.4; the two "guess" (weight 0.33) pins sit at
    // x=0.6. Unweighted mean would land at 0.533; weighted mean must
    // be < 0.5 because the "sure" pin outweighs both "guess" pins
    // combined (1.0 vs 0.66).
    const pins: GeoPinLike[] = [
      pin(1, 0.4, 0.5, 1),
      pin(2, 0.6, 0.5, 3),
      pin(3, 0.6, 0.5, 3),
    ]
    const out = evaluateConsensus(pins, RADIUS)
    assert.ok(
      out.centroid.x < 0.5,
      `expected weighted centroid < 0.5 but got ${out.centroid.x}`,
    )
    assert.ok(out.centroid.x < 0.533) // strictly tighter than unweighted
  })

  it('all-equal confidences match the unweighted result', () => {
    // Same set of pin positions, once with no confidence and once
    // with every pin marked "approx" (weight 0.66). Centroids and
    // sigmas must agree because the weights factor out of both the
    // numerator and the denominator.
    const positions: Array<[number, number]> = [
      [0.4, 0.4],
      [0.45, 0.42],
      [0.5, 0.5],
      [0.52, 0.48],
      [0.48, 0.45],
    ]
    const unweighted = evaluateConsensus(
      positions.map(([x, y], i) => pin(i + 1, x, y)),
      RADIUS,
    )
    const weighted = evaluateConsensus(
      positions.map(([x, y], i) => pin(i + 1, x, y, 2)),
      RADIUS,
    )
    assert.ok(Math.abs(unweighted.centroid.x - weighted.centroid.x) < 1e-9)
    assert.ok(Math.abs(unweighted.centroid.y - weighted.centroid.y) < 1e-9)
    assert.ok(Math.abs(unweighted.sigmaX - weighted.sigmaX) < 1e-9)
    assert.ok(Math.abs(unweighted.sigmaY - weighted.sigmaY) < 1e-9)
  })

  it('exposes a 1.0/0.66/0.33 weight table for confidences 1/2/3', () => {
    // The weights are part of the algorithm's public contract — if a
    // future tweak changes them, the version bump will trip the
    // version test, and this test pins the values themselves.
    assert.equal(GEO_CONSENSUS_CONFIDENCE_WEIGHTS[1], 1.0)
    assert.equal(GEO_CONSENSUS_CONFIDENCE_WEIGHTS[2], 0.66)
    assert.equal(GEO_CONSENSUS_CONFIDENCE_WEIGHTS[3], 0.33)
  })

  it('a low-confidence outlier shifts the centroid less than a high-confidence one', () => {
    // Tight cluster of four "sure" pins around (0.5, 0.5) plus one
    // outlier at (0.7, 0.5). When the outlier is "sure" it pulls the
    // mean further than when it is a "guess".
    const cluster: GeoPinLike[] = [
      pin(1, 0.5, 0.5, 1),
      pin(2, 0.501, 0.5, 1),
      pin(3, 0.499, 0.5, 1),
      pin(4, 0.5, 0.501, 1),
    ]
    const sureOut = evaluateConsensus([...cluster, pin(5, 0.7, 0.5, 1)], RADIUS)
    const guessOut = evaluateConsensus([...cluster, pin(5, 0.7, 0.5, 3)], RADIUS)
    assert.ok(
      guessOut.centroid.x < sureOut.centroid.x,
      `guess outlier should pull less: sure ${sureOut.centroid.x}, guess ${guessOut.centroid.x}`,
    )
  })

  it('mixing legacy (no confidence) pins with rated pins is supported', () => {
    // Legacy rows have NULL confidence; the formula treats them as
    // "sure" so a v2 re-run over a pre-confidence dataset produces
    // the same result as v1 would on it.
    const allLegacy = evaluateConsensus(
      [
        pin(1, 0.5, 0.5),
        pin(2, 0.501, 0.5),
        pin(3, 0.499, 0.5),
      ],
      RADIUS,
    )
    const allSure = evaluateConsensus(
      [
        pin(1, 0.5, 0.5, 1),
        pin(2, 0.501, 0.5, 1),
        pin(3, 0.499, 0.5, 1),
      ],
      RADIUS,
    )
    assert.ok(Math.abs(allLegacy.centroid.x - allSure.centroid.x) < 1e-9)
    assert.ok(Math.abs(allLegacy.sigmaX - allSure.sigmaX) < 1e-9)
  })
})

describe('grantsForAcceptedPin', () => {
  it('accepted-but-loose pin (just outside 1σ) yields nothing', () => {
    const grants = grantsForAcceptedPin({
      distanceFromCentroid: 0.02,
      sigmaX: 0.01,
      sigmaY: 0.01,
      userAcceptedCountAfterThis: 1,
    })
    assert.equal(grants.length, 0)
  })

  it('accepted pin inside 1σ → +1 hint_letter', () => {
    const grants = grantsForAcceptedPin({
      distanceFromCentroid: 0.009,
      sigmaX: 0.01,
      sigmaY: 0.01,
      userAcceptedCountAfterThis: 1,
    })
    assert.equal(grants.length, 1)
    assert.equal(grants[0]?.itemKey, 'hint_letter')
  })

  it('accepted pin inside 0.5σ → +1 hint_letter + 1 second_chance', () => {
    // The old publisher/developer alternation died with the metadata-hint
    // retirement — the tight-pin bonus is a flat second_chance regardless
    // of the user's accepted count parity.
    const odd = grantsForAcceptedPin({
      distanceFromCentroid: 0.001,
      sigmaX: 0.01,
      sigmaY: 0.01,
      userAcceptedCountAfterThis: 1,
    })
    assert.equal(odd.length, 2)
    assert.equal(odd[0]?.itemKey, 'hint_letter')
    assert.equal(odd[1]?.itemKey, 'second_chance')

    const even = grantsForAcceptedPin({
      distanceFromCentroid: 0.001,
      sigmaX: 0.01,
      sigmaY: 0.01,
      userAcceptedCountAfterThis: 2,
    })
    assert.equal(even[1]?.itemKey, 'second_chance')
  })

  it('every 10th accepted pin → +1 streak_freeze', () => {
    const out = grantsForAcceptedPin({
      distanceFromCentroid: 0.005, // outside 0.5σ but inside 1σ
      sigmaX: 0.01,
      sigmaY: 0.01,
      userAcceptedCountAfterThis: 10,
    })
    // Inside 1σ → hint_letter. 10 % 10 === 0 → streak_freeze. Count: 2.
    const keys = out.map((g) => g.itemKey)
    assert.ok(keys.includes('hint_letter'))
    assert.ok(keys.includes('streak_freeze'))
  })

  it('count=0 does not award a streak_freeze (0 % 10 === 0 but guarded)', () => {
    const out = grantsForAcceptedPin({
      distanceFromCentroid: 0.005,
      sigmaX: 0.01,
      sigmaY: 0.01,
      userAcceptedCountAfterThis: 0,
    })
    // 0 is the "first ever pin not yet counted" case; the implementation
    // explicitly excludes it from the every-10th bonus to avoid silly
    // behavior on a fresh user.
    const keys = out.map((g) => g.itemKey)
    assert.ok(!keys.includes('streak_freeze'))
  })
})
