import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import type { DomainLogger } from '../ports/logger.js'
import {
  createGeoGamersScoringService,
  gamePointsForAttempt,
  locationPointsFromDistance,
  GEOGAMERS_GAME_POINTS,
  GEOGAMERS_LOCATION_MAX,
  GEOGAMERS_SCORE_VERSION,
} from './geogamers-scoring.service.js'

// Minimal no-op logger satisfying the DomainLogger port.
const noopLogger: DomainLogger = {
  info() {},
  warn() {},
  error() {},
  debug() {},
  fatal() {},
  trace() {},
  child() {
    return noopLogger
  },
}

describe('gamePointsForAttempt', () => {
  it('awards 100 / 66 / 33 on attempts 1..3', () => {
    assert.equal(gamePointsForAttempt(1), 100)
    assert.equal(gamePointsForAttempt(2), 66)
    assert.equal(gamePointsForAttempt(3), 33)
  })

  it('awards 0 once attempts are exhausted or invalid', () => {
    assert.equal(gamePointsForAttempt(4), 0)
    assert.equal(gamePointsForAttempt(0), 0)
    assert.equal(gamePointsForAttempt(-1), 0)
    assert.equal(gamePointsForAttempt(1.5), 0)
  })

  it('matches the exported band table', () => {
    assert.deepEqual([...GEOGAMERS_GAME_POINTS], [100, 66, 33])
  })
})

describe('locationPointsFromDistance', () => {
  it('awards the full ceiling for a perfect pin', () => {
    assert.equal(locationPointsFromDistance(0), GEOGAMERS_LOCATION_MAX)
    assert.equal(locationPointsFromDistance(0), 100)
  })

  it('decays toward zero as distance grows', () => {
    const near = locationPointsFromDistance(0.1)
    const mid = locationPointsFromDistance(0.5)
    const far = locationPointsFromDistance(1)
    assert.ok(near > mid, `near (${near}) should beat mid (${mid})`)
    assert.ok(mid > far, `mid (${mid}) should beat far (${far})`)
    assert.ok(far <= 1, `far (${far}) should be ~0`)
  })

  it('clamps out-of-range distances', () => {
    assert.equal(locationPointsFromDistance(-5), 100)
    assert.equal(locationPointsFromDistance(5), locationPointsFromDistance(1))
  })

  it('never exceeds the ceiling', () => {
    for (const d of [0, 0.01, 0.2, 0.7, 1]) {
      const p = locationPointsFromDistance(d)
      assert.ok(p >= 0 && p <= GEOGAMERS_LOCATION_MAX, `d=${d} -> ${p} out of range`)
    }
  })
})

describe('createGeoGamersScoringService', () => {
  const svc = createGeoGamersScoringService({ logger: noopLogger })

  it('scoreLocation gives full points for an exact pin', () => {
    const r = svc.scoreLocation({ x: 0.5, y: 0.5 }, { x: 0.5, y: 0.5 })
    assert.equal(r.distance, 0)
    assert.equal(r.locationPoints, 100)
    assert.equal(r.wrongMap, false)
    assert.equal(r.scoreVersion, GEOGAMERS_SCORE_VERSION)
  })

  it('scoreLocation floors distance to 1.0 on wrong map (≈0 points)', () => {
    const r = svc.scoreLocation({ x: 0.5, y: 0.5 }, { x: 0.5, y: 0.5 }, { wrongMap: true })
    // Same pin, but wrongMap overrides distance to the maximum.
    assert.equal(r.distance, 1)
    assert.equal(r.wrongMap, true)
    assert.equal(r.locationPoints, locationPointsFromDistance(1))
    assert.ok(r.locationPoints <= 1)
  })

  it('gamePoints delegates to the band table', () => {
    assert.equal(svc.gamePoints(1), 100)
    assert.equal(svc.gamePoints(3), 33)
    assert.equal(svc.gamePoints(4), 0)
  })
})
