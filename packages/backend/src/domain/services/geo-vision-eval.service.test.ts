import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  euclideanDistance,
  normalizedDistance,
  parseVisionPoint,
  summarizeVisionEval,
  VISION_ENABLE_MAX_MEDIAN_DISTANCE,
  VISION_ENABLE_MIN_WITHIN_RADIUS,
  type VisionEvalSample,
} from './geo-vision-eval.service.js'

describe('distance helpers', () => {
  it('euclidean is raw distance in map space', () => {
    assert.ok(Math.abs(euclideanDistance({ x: 0, y: 0 }, { x: 0.3, y: 0.4 }) - 0.5) < 1e-9)
  })
  it('normalized divides by the unit-square diagonal (√2)', () => {
    // Opposite corners → raw √2 → normalized 1.
    assert.ok(Math.abs(normalizedDistance({ x: 0, y: 0 }, { x: 1, y: 1 }) - 1) < 1e-9)
  })
})

describe('summarizeVisionEval', () => {
  it('returns a non-passing zero summary for an empty set', () => {
    const out = summarizeVisionEval([])
    assert.equal(out.count, 0)
    assert.equal(out.pass, false)
  })

  it('passes when ≥40% land within radius and median error < 0.1', () => {
    // 5 spot-on predictions (distance 0) → 100% within radius, median 0.
    const samples: VisionEvalSample[] = Array.from({ length: 5 }, () => ({
      predicted: { x: 0.5, y: 0.5 },
      truth: { x: 0.5, y: 0.5 },
      radius: 0.03,
    }))
    const out = summarizeVisionEval(samples)
    assert.equal(out.withinRadiusPct, 1)
    assert.equal(out.medianNormalizedDistance, 0)
    assert.equal(out.pass, true)
  })

  it('fails when predictions are far off (noise floor)', () => {
    // All predictions at the opposite corner → 0% within radius, median ≈ 1.
    const samples: VisionEvalSample[] = Array.from({ length: 10 }, () => ({
      predicted: { x: 1, y: 1 },
      truth: { x: 0, y: 0 },
      radius: 0.03,
    }))
    const out = summarizeVisionEval(samples)
    assert.equal(out.withinRadiusPct, 0)
    assert.equal(out.pass, false)
  })

  it('fails when within-radius is below the 40% bar despite some hits', () => {
    // 3 hits + 7 far misses → 30% within radius < 40% → fail even if the 3
    // hits drag the median around.
    const hits: VisionEvalSample[] = Array.from({ length: 3 }, () => ({
      predicted: { x: 0.5, y: 0.5 },
      truth: { x: 0.5, y: 0.5 },
      radius: 0.03,
    }))
    const misses: VisionEvalSample[] = Array.from({ length: 7 }, () => ({
      predicted: { x: 0.9, y: 0.9 },
      truth: { x: 0.1, y: 0.1 },
      radius: 0.03,
    }))
    const out = summarizeVisionEval([...hits, ...misses])
    assert.ok(out.withinRadiusPct < VISION_ENABLE_MIN_WITHIN_RADIUS)
    assert.equal(out.pass, false)
  })

  it('exposes the enable bar as constants', () => {
    assert.equal(VISION_ENABLE_MIN_WITHIN_RADIUS, 0.4)
    assert.equal(VISION_ENABLE_MAX_MEDIAN_DISTANCE, 0.1)
  })
})

describe('parseVisionPoint', () => {
  it('parses bare JSON', () => {
    assert.deepEqual(parseVisionPoint('{"x":0.4,"y":0.6}'), { x: 0.4, y: 0.6 })
  })
  it('parses JSON embedded in prose / code fences', () => {
    assert.deepEqual(
      parseVisionPoint('Here it is:\n```json\n{ "x": 0.25, "y": 0.75 }\n```\nDone.'),
      { x: 0.25, y: 0.75 },
    )
  })
  it('rejects out-of-range or missing coords', () => {
    assert.equal(parseVisionPoint('{"x":1.4,"y":0.2}'), null)
    assert.equal(parseVisionPoint('{"x":0.2}'), null)
    assert.equal(parseVisionPoint('no json here'), null)
    assert.equal(parseVisionPoint(''), null)
  })
})
