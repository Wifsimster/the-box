import type { GeoPoint } from '@the-box/types'

// Accuracy metrics for the LLM-vision localization study (issue #331, phase 5).
//
// Before agent_vision pins are allowed to vote (even at weight 0.25), the
// offline harness `scripts/geo-vision-eval.ts` runs vision localization against
// known-truth promoted metas and feeds the results here. The verdict gates
// flipping GEO_AGENT_VISION_ENABLED: if the model can't localize well enough,
// vision pins add noise rather than signal and the tier stays off.
//
// Pure — no I/O — so the metric math and the JSON parsing are unit-tested.

// Enable bar: at least this fraction of predictions must land within the map's
// consensus radius, AND the median normalized error must be below the cap.
export const VISION_ENABLE_MIN_WITHIN_RADIUS = 0.4
export const VISION_ENABLE_MAX_MEDIAN_DISTANCE = 0.1

export interface VisionEvalSample {
  predicted: GeoPoint
  truth: GeoPoint
  // The map's consensus_radius — raw euclidean units in the [0,1] map space,
  // the same convention geo-consensus compares against.
  radius: number
}

export interface VisionEvalSummary {
  count: number
  medianNormalizedDistance: number
  withinRadiusPct: number
  within01Pct: number
  pass: boolean
}

/** Raw euclidean distance in the map's [0,1] space (matches consensus radius). */
export function euclideanDistance(a: GeoPoint, b: GeoPoint): number {
  const dx = a.x - b.x
  const dy = a.y - b.y
  return Math.sqrt(dx * dx + dy * dy)
}

/**
 * Normalized to [0,1] by the diagonal of the unit square (√2) — the same
 * "normalized distance" geo-scoring uses, so the median/0.1 bar is comparable
 * to the free-play scoring curve.
 */
export function normalizedDistance(a: GeoPoint, b: GeoPoint): number {
  return euclideanDistance(a, b) / Math.SQRT2
}

function median(values: number[]): number {
  if (values.length === 0) return 0
  const s = [...values].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 === 0 ? (s[mid - 1]! + s[mid]!) / 2 : s[mid]!
}

export function summarizeVisionEval(samples: VisionEvalSample[]): VisionEvalSummary {
  const count = samples.length
  if (count === 0) {
    return {
      count: 0,
      medianNormalizedDistance: 0,
      withinRadiusPct: 0,
      within01Pct: 0,
      pass: false,
    }
  }
  const norm = samples.map((s) => normalizedDistance(s.predicted, s.truth))
  const withinRadius = samples.filter(
    (s) => euclideanDistance(s.predicted, s.truth) <= s.radius,
  ).length
  const within01 = norm.filter((d) => d <= 0.1).length
  const medianNormalizedDistance = median(norm)
  const withinRadiusPct = withinRadius / count
  const within01Pct = within01 / count
  const pass =
    withinRadiusPct >= VISION_ENABLE_MIN_WITHIN_RADIUS &&
    medianNormalizedDistance < VISION_ENABLE_MAX_MEDIAN_DISTANCE
  return { count, medianNormalizedDistance, withinRadiusPct, within01Pct, pass }
}

/**
 * Parse a vision model's reply into a normalized point. Tolerant of prose or
 * code fences around the JSON; returns null when no valid `{x,y}` in [0,1] is
 * present. The harness counts a null as a miss, never a crash — one bad
 * completion shouldn't abort a 50-sample run.
 */
export function parseVisionPoint(text: string): GeoPoint | null {
  if (!text) return null
  const candidates: string[] = []
  const braced = text.match(/\{[^{}]*\}/)
  if (braced) candidates.push(braced[0])
  candidates.push(text.trim())
  for (const c of candidates) {
    try {
      const obj = JSON.parse(c) as { x?: unknown; y?: unknown }
      const x = Number(obj.x)
      const y = Number(obj.y)
      if (Number.isFinite(x) && Number.isFinite(y) && x >= 0 && x <= 1 && y >= 0 && y <= 1) {
        return { x, y }
      }
    } catch {
      // try the next candidate
    }
  }
  return null
}
