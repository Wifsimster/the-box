import type { DomainLogger } from '../ports/logger.js'
import type { GeoPoint } from '@the-box/types'

// Current scoring formula version. Bump whenever constants below change so
// historical scores remain comparable via `geo_guess.score_version`.
export const GEO_SCORE_VERSION = 1

// Maximum points awarded for a perfect pin (distance 0).
export const GEO_SCORE_MAX = 2000

// Exponential decay rate. With DECAY=8: a pin 10% across the map keeps ~45%
// of the max; a pin 25% across drops to ~14%; a pin halfway across is ~2%.
// Diagonal of a [0..1] square is sqrt(2), so normalized distance is in [0..1].
export const GEO_SCORE_DECAY = 8

/**
 * Euclidean distance between two normalized [0..1] points, further normalized
 * by the unit-square diagonal so the result sits in [0..1].
 */
export function geoDistance(a: GeoPoint, b: GeoPoint): number {
  const dx = a.x - b.x
  const dy = a.y - b.y
  const raw = Math.sqrt(dx * dx + dy * dy)
  return raw / Math.SQRT2
}

/**
 * Map a normalized distance in [0..1] to an integer score in [0..GEO_SCORE_MAX].
 * Exponential decay keeps near-perfect pins rewarding while dropping far pins
 * to near-zero, matching the scoring curve seen in GeoGuessr-style games.
 */
export function geoScoreFromDistance(distance: number): number {
  const clamped = Math.max(0, Math.min(1, distance))
  return Math.round(GEO_SCORE_MAX * Math.exp(-GEO_SCORE_DECAY * clamped))
}

export interface GeoScoringResult {
  distance: number
  score: number
  scoreVersion: number
}

export interface GeoScoringService {
  score(guess: GeoPoint, canonical: GeoPoint): GeoScoringResult
}

export interface GeoScoringServiceDeps {
  logger: DomainLogger
}

export function createGeoScoringService(deps: GeoScoringServiceDeps): GeoScoringService {
  const log = deps.logger.child({ service: 'geo-scoring' })

  return {
    score(guess, canonical) {
      const distance = geoDistance(guess, canonical)
      const score = geoScoreFromDistance(distance)
      log.debug({ guess, canonical, distance, score }, 'scored guess')
      return { distance, score, scoreVersion: GEO_SCORE_VERSION }
    },
  }
}
