import type { DomainLogger } from '../ports/logger.js'
import type { GeoPoint } from '@the-box/types'
import { geoDistance, GEO_SCORE_DECAY } from './geo-scoring.service.js'

export const GEOGAMERS_SCORE_VERSION = 1

export const GEOGAMERS_GAME_POINTS = [100, 66, 33] as const

export const GEOGAMERS_ATTEMPTS_MAX = 3

export const GEOGAMERS_LOCATION_MAX = 100

export function gamePointsForAttempt(attemptNumber: number): number {
  if (!Number.isInteger(attemptNumber) || attemptNumber < 1) return 0
  return GEOGAMERS_GAME_POINTS[attemptNumber - 1] ?? 0
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n))
}

export function locationPointsFromDistance(distance: number): number {
  return Math.round(GEOGAMERS_LOCATION_MAX * Math.exp(-GEO_SCORE_DECAY * clamp01(distance)))
}

export interface GeoGamersLocationResult {
  distance: number
  locationPoints: number
  scoreVersion: number
  wrongMap: boolean
}

export interface GeoGamersLocationOptions {
  wrongMap?: boolean
}

export interface GeoGamersScoringService {
  gamePoints(attemptNumber: number): number
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
