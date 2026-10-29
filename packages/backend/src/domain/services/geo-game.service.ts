import type { DomainLogger } from '../ports/logger.js'
import type {
  GeoPinRepository,
  GeoScreenshotRepository,
  PlayerActivityQuery,
} from '../ports/repositories.js'
import type {
  GeoMap,
  GeoPoint,
  GeoScreenshotCandidate,
  GeoScreenshotMeta,
} from '@the-box/types'
import type { GeoScoringService } from './geo-scoring.service.js'
import type { GeoMapRepository } from '../ports/repositories.js'

export class GeoGameError extends Error {
  constructor(
    message: string,
    public code:
      | 'CHALLENGE_NOT_FOUND'
      | 'INVALID_POINT'
      | 'INVALID_MAP'
      | 'NO_CANDIDATE'
      | 'CONTRIBUTE_RATE_LIMIT'
      | 'CONTRIBUTE_NOT_UNLOCKED',
  ) {
    super(message)
    this.name = 'GeoGameError'
  }
}

export const GEO_CONTRIBUTE_HOURLY_LIMIT = 20

export const GEO_CONTRIBUTE_MIN_DAYS_PLAYED = 3

export interface GeoFreePlayView {
  game: { id: number; name: string }
  meta: Pick<GeoScreenshotMeta, 'id'>
  candidate: GeoScreenshotCandidate
  maps: GeoMap[]
  map?: GeoMap
}

export interface GeoFreePlayResult {
  guess: GeoPoint
  canonical: GeoPoint
  distance: number
  score: number
  scoreVersion: number
  correctMapId: number
  wrongMap: boolean
  pinCount: number
}

export interface GeoGameService {
  pickContributionTarget(args: {
    gameId: number
    userId: string
    isAnonymous?: boolean
  }): Promise<GeoScreenshotCandidate>

  pickFreePlayScreenshot(args: {
    gameId: number
    geoMapId?: number
    excludeMetaIds?: number[]
  }): Promise<GeoFreePlayView | null>

  scoreFreePlayGuess(args: {
    metaId: number
    geoMapId: number
    guess: GeoPoint
  }): Promise<GeoFreePlayResult>
}

export interface GeoGameServiceDeps {
  logger: DomainLogger
  geoScoringService: GeoScoringService
  geoScreenshotRepository: GeoScreenshotRepository
  geoPinRepository: GeoPinRepository
  geoMapRepository: GeoMapRepository
  sessionRepository: PlayerActivityQuery
}

function validPoint(p: GeoPoint): boolean {
  return (
    Number.isFinite(p.x) &&
    Number.isFinite(p.y) &&
    p.x >= 0 &&
    p.x <= 1 &&
    p.y >= 0 &&
    p.y <= 1
  )
}

const PLACEHOLDER_URL_PATTERNS = [
  /(^|\/\/)placehold\.co\//i,
  /(^|\/\/)via\.placeholder\.com\//i,
  /\/map-placeholder\.(jpg|jpeg|png|webp)(\?|$)/i,
]

function isPlaceholderImageUrl(url: string | null | undefined): boolean {
  if (!url) return true
  return PLACEHOLDER_URL_PATTERNS.some((p) => p.test(url))
}

export function createGeoGameService(deps: GeoGameServiceDeps): GeoGameService {
  const {
    geoScoringService,
    geoScreenshotRepository,
    geoPinRepository,
    geoMapRepository,
    sessionRepository,
  } = deps

  return {
    async pickFreePlayScreenshot({ gameId, geoMapId, excludeMetaIds }) {
      const enabledMaps = await geoMapRepository.listEnabledByGameId(gameId)
      if (enabledMaps.length === 0) return null
      if (geoMapId != null && !enabledMaps.some((m) => m.id === geoMapId)) {
        throw new GeoGameError(
          'geoMapId does not belong to the requested game',
          'INVALID_MAP',
        )
      }
      const meta = await geoScreenshotRepository.pickRandomPromotedForGame(
        gameId,
        geoMapId,
        excludeMetaIds,
      )
      if (!meta) return null
      const candidate = await geoScreenshotRepository.findCandidateById(
        meta.geoScreenshotCandidateId,
      )
      if (!candidate) return null
      if (
        isPlaceholderImageUrl(candidate.imageUrl) ||
        enabledMaps.every((m) => isPlaceholderImageUrl(m.imageUrl))
      ) {
        return null
      }
      return {
        game: { id: gameId, name: '' },
        meta: { id: meta.id },
        candidate,
        maps: enabledMaps,
      }
    },

    async scoreFreePlayGuess({ metaId, geoMapId, guess }) {
      if (!validPoint(guess)) {
        throw new GeoGameError('guess must have x and y in [0..1]', 'INVALID_POINT')
      }
      const meta = await geoScreenshotRepository.findMetaById(metaId)
      if (!meta) {
        throw new GeoGameError('meta not found', 'CHALLENGE_NOT_FOUND')
      }
      const candidate = await geoScreenshotRepository.findCandidateById(
        meta.geoScreenshotCandidateId,
      )
      if (!candidate) {
        throw new GeoGameError('candidate not found', 'CHALLENGE_NOT_FOUND')
      }
      const enabledMaps = await geoMapRepository.listEnabledByGameId(candidate.gameId)
      const isEnabled = enabledMaps.some((m) => m.id === geoMapId)
      if (!isEnabled && geoMapId !== meta.geoMapId) {
        throw new GeoGameError(
          'geoMapId does not belong to the screenshot game',
          'INVALID_MAP',
        )
      }
      const wrongMap = geoMapId !== meta.geoMapId
      const { distance, score, scoreVersion } = geoScoringService.score(
        guess,
        meta.canonical,
        { wrongMap },
      )
      return {
        guess,
        canonical: meta.canonical,
        distance,
        score,
        scoreVersion,
        correctMapId: meta.geoMapId,
        wrongMap,
        pinCount: candidate.pinCount,
      }
    },

    async pickContributionTarget({ gameId, userId, isAnonymous }) {
      if (!isAnonymous) {
        const daysPlayed = await sessionRepository.countDistinctDaysPlayed(userId)
        if (daysPlayed < GEO_CONTRIBUTE_MIN_DAYS_PLAYED) {
          throw new GeoGameError(
            `contribute unlocks after ${GEO_CONTRIBUTE_MIN_DAYS_PLAYED} days of activity (${daysPlayed}/${GEO_CONTRIBUTE_MIN_DAYS_PLAYED})`,
            'CONTRIBUTE_NOT_UNLOCKED',
          )
        }
      }

      const hourly = await geoPinRepository.countByUserInWindow(userId, 60 * 60)
      if (hourly >= GEO_CONTRIBUTE_HOURLY_LIMIT) {
        throw new GeoGameError(
          `rate limit: ${GEO_CONTRIBUTE_HOURLY_LIMIT} pins per hour`,
          'CONTRIBUTE_RATE_LIMIT',
        )
      }

      const candidate = await geoScreenshotRepository.findRandomUnlabeledForGame(gameId)
      if (!candidate) {
        throw new GeoGameError('no unlabeled screenshots available', 'NO_CANDIDATE')
      }
      return candidate
    },
  }
}
