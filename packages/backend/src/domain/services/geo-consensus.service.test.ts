import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  evaluateConsensus,
  grantsForAcceptedPin,
  GEO_CONSENSUS_MIN_PINS_TO_PROMOTE,
  GEO_CONSENSUS_VERSION,
  type GeoPinLike,
} from './geo-consensus.service.js'

const RADIUS = 0.05

function pin(id: number, x: number, y: number): GeoPinLike {
  return { id, pin: { x, y } }
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

  it('accepted pin inside 1σ → +1 hint_year', () => {
    const grants = grantsForAcceptedPin({
      distanceFromCentroid: 0.009,
      sigmaX: 0.01,
      sigmaY: 0.01,
      userAcceptedCountAfterThis: 1,
    })
    assert.equal(grants.length, 1)
    assert.equal(grants[0]?.itemKey, 'hint_year')
  })

  it('accepted pin inside 0.5σ → +1 hint_year + a publisher/developer hint', () => {
    const odd = grantsForAcceptedPin({
      distanceFromCentroid: 0.001,
      sigmaX: 0.01,
      sigmaY: 0.01,
      userAcceptedCountAfterThis: 1, // odd → developer
    })
    assert.equal(odd.length, 2)
    assert.equal(odd[0]?.itemKey, 'hint_year')
    assert.equal(odd[1]?.itemKey, 'hint_developer')

    const even = grantsForAcceptedPin({
      distanceFromCentroid: 0.001,
      sigmaX: 0.01,
      sigmaY: 0.01,
      userAcceptedCountAfterThis: 2, // even → publisher
    })
    assert.equal(even[1]?.itemKey, 'hint_publisher')
  })

  it('every 10th accepted pin → +1 timer_extension', () => {
    const out = grantsForAcceptedPin({
      distanceFromCentroid: 0.005, // outside 0.5σ but inside 1σ
      sigmaX: 0.01,
      sigmaY: 0.01,
      userAcceptedCountAfterThis: 10,
    })
    // Inside 1σ → hint_year. 10 % 10 === 0 → timer_extension. Count: 2.
    const keys = out.map((g) => g.itemKey)
    assert.ok(keys.includes('hint_year'))
    assert.ok(keys.includes('timer_extension'))
  })

  it('count=0 does not award a timer_extension (0 % 10 === 0 but guarded)', () => {
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
    assert.ok(!keys.includes('timer_extension'))
  })
})
