import type { DomainLogger } from '../ports/logger.js'
import type { GeoPoint } from '@the-box/types'
import { geoDistance, GEO_SCORE_DECAY } from './geo-scoring.service.js'

// GeoGamers scoring. A run has two independently-scored phases whose points
// sum to a 200/day headline:
//   phase 1 (identify the game) -> 100 / 66 / 33 / 0 by the attempt that lands
//   phase 2 (pin the location)  -> 0..100 by pin accuracy
//
// Location scoring deliberately REUSES the geo mode decay curve
// (`GEO_SCORE_DECAY`) so the two modes feel identical to place a pin in — only
// the ceiling differs (2000 -> 100). Because we reuse the exact curve and only
// rescale linearly, this starts at version 1; bump it whenever a constant here
// changes so historical `geogamers_run.score_version` stays comparable.
export const GEOGAMERS_SCORE_VERSION = 1

// Points for identifying the game, indexed by attempt number (1-based). A 4th+
// attempt (shouldn't happen — the run locks at 3) scores 0.
export const GEOGAMERS_GAME_POINTS = [100, 66, 33] as const

export const GEOGAMERS_ATTEMPTS_MAX = 3

// Ceiling for the location phase. Rescales the geo curve's 2000 down to 100 so
// the two phases sum to a clean 200.
export const GEOGAMERS_LOCATION_MAX = 100

/**
 * Points awarded for identifying the game on a given attempt (1-based).
 * Attempt 1 -> 100, 2 -> 66, 3 -> 33, anything else (exhausted / invalid) -> 0.
 */
export function gamePointsForAttempt(attemptNumber: number): number {
  if (!Number.isInteger(attemptNumber) || attemptNumber < 1) return 0
  return GEOGAMERS_GAME_POINTS[attemptNumber - 1] ?? 0
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n))
}

/**
 * Map a normalized distance in [0..1] to a location score in
 * [0..GEOGAMERS_LOCATION_MAX], using the same exponential decay as geo mode.
 * distance 0 -> 100, ~0.1 across -> ~45, halfway -> ~2, 1 -> ~0.
 */
export function locationPointsFromDistance(distance: number): number {
  return Math.round(GEOGAMERS_LOCATION_MAX * Math.exp(-GEO_SCORE_DECAY * clamp01(distance)))
}

export interface GeoGamersLocationResult {
  distance: number
  locationPoints: number
  scoreVersion: number
  // True when the player pinned on a map the screenshot doesn't belong to.
  // Distance is floored to 1.0 (→ ~0 points), matching geo mode's wrong-map
  // rule, without a new formula version.
  wrongMap: boolean
}

export interface GeoGamersLocationOptions {
  wrongMap?: boolean
}

export interface GeoGamersScoringService {
  /** Points for the game-identification phase given the landing attempt. */
  gamePoints(attemptNumber: number): number
  /** Score the location phase from a guess pin against the canonical pin. */
  scoreLocation(
    guess: GeoPoint,
    canonical: GeoPoint,
    opts?: GeoGamersLocationOptions,
  ): GeoGamersLocationResult
}

export interface GeoGamersScoringServiceDeps {
  logger: DomainLogger
}

export function createGeoGamersScoringService(
  deps: GeoGamersScoringServiceDeps,
): GeoGamersScoringService {
  const log = deps.logger.child({ service: 'geogamers-scoring' })

  return {
    gamePoints(attemptNumber) {
      return gamePointsForAttempt(attemptNumber)
    },

    scoreLocation(guess, canonical, opts) {
      const wrongMap = !!opts?.wrongMap
      const rawDistance = geoDistance(guess, canonical)
      const distance = wrongMap ? 1 : rawDistance
      const locationPoints = locationPointsFromDistance(distance)
      log.debug({ guess, canonical, distance, locationPoints, wrongMap }, 'scored location')
      return {
        distance,
        locationPoints,
        scoreVersion: GEOGAMERS_SCORE_VERSION,
        wrongMap,
      }
    },
  }
}
