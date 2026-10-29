import type { GeoPoint } from '@the-box/types'

export const VISION_ENABLE_MIN_WITHIN_RADIUS = 0.4
export const VISION_ENABLE_MAX_MEDIAN_DISTANCE = 0.1

export interface VisionEvalSample {
  predicted: GeoPoint
  truth: GeoPoint
  radius: number
}

export interface VisionEvalSummary {
  count: number
  medianNormalizedDistance: number
  withinRadiusPct: number
  within01Pct: number
  pass: boolean
}

export function euclideanDistance(a: GeoPoint, b: GeoPoint): number {
  const dx = a.x - b.x
  const dy = a.y - b.y
  return Math.sqrt(dx * dx + dy * dy)
}

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
    }
  }
  return null
}
