import type { DomainLogger } from '../ports/logger.js'
import type { GeoPoint } from '@the-box/types'

export const GEO_SCORE_VERSION = 2

export const GEO_SCORE_MAX = 2000

export const GEO_SCORE_DECAY = 8

export function geoDistance(a: GeoPoint, b: GeoPoint): number {
  const dx = a.x - b.x
  const dy = a.y - b.y
  const raw = Math.sqrt(dx * dx + dy * dy)
  return raw / Math.SQRT2
}

export function geoScoreFromDistance(distance: number): number {
  const clamped = Math.max(0, Math.min(1, distance))
  return Math.round(GEO_SCORE_MAX * Math.exp(-GEO_SCORE_DECAY * clamped))
}

export interface GeoScoringResult {
  distance: number
  score: number
  scoreVersion: number
  wrongMap: boolean
}

export interface GeoScoringOptions {
  wrongMap?: boolean
}

export interface GeoScoringService {
  score(
    guess: GeoPoint,
    canonical: GeoPoint,
    opts?: GeoScoringOptions,
  ): GeoScoringResult
}

export interface GeoScoringServiceDeps {
  logger: DomainLogger
}

export function createGeoScoringService(deps: GeoScoringServiceDeps): GeoScoringService {
  const log = deps.logger.child({ service: 'geo-scoring' })

  return {
    score(guess, canonical, opts) {
      const wrongMap = !!opts?.wrongMap
      const rawDistance = geoDistance(guess, canonical)
      const distance = wrongMap ? 1 : rawDistance
      const score = geoScoreFromDistance(distance)
      log.debug({ guess, canonical, distance, score, wrongMap }, 'scored guess')
      return { distance, score, scoreVersion: GEO_SCORE_VERSION, wrongMap }
    },
  }
}
