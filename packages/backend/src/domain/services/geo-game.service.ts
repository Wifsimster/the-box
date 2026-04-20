import type { DomainLogger } from '../ports/logger.js'
import type {
  GeoChallengeRepository,
  GeoPinRepository,
  GeoScreenshotRepository,
} from '../ports/repositories.js'
import type {
  GeoChallenge,
  GeoGuessResult,
  GeoLeaderboardEntry,
  GeoPoint,
  GeoScreenshotCandidate,
  GeoScreenshotMeta,
} from '@the-box/types'
import type { GeoScoringService } from './geo-scoring.service.js'

export class GeoGameError extends Error {
  constructor(
    message: string,
    public code:
      | 'CHALLENGE_NOT_FOUND'
      | 'ALREADY_GUESSED'
      | 'INVALID_POINT'
      | 'NO_CANDIDATE'
      | 'CONTRIBUTE_RATE_LIMIT',
  ) {
    super(message)
    this.name = 'GeoGameError'
  }
}

export const GEO_CONTRIBUTE_HOURLY_LIMIT = 20

export interface GeoDailyChallengeView {
  challenge: GeoChallenge
  meta: GeoScreenshotMeta
  hasGuessed: boolean
}

export interface GeoGameService {
  getDailyChallenge(args: {
    date: string
    userId?: string
  }): Promise<GeoDailyChallengeView | null>

  submitGuess(args: {
    userId: string
    challengeId: number
    guess: GeoPoint
    durationMs?: number
  }): Promise<GeoGuessResult>

  getLeaderboardDaily(date: string, limit?: number): Promise<GeoLeaderboardEntry[]>
  getLeaderboardMonthly(period: string, limit?: number): Promise<GeoLeaderboardEntry[]>

  pickContributionTarget(args: {
    gameId: number
    userId: string
  }): Promise<GeoScreenshotCandidate>
}

export interface GeoGameServiceDeps {
  logger: DomainLogger
  geoScoringService: GeoScoringService
  geoChallengeRepository: GeoChallengeRepository
  geoScreenshotRepository: GeoScreenshotRepository
  geoPinRepository: GeoPinRepository
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

function monthPeriodOf(dateStr: string): string {
  return dateStr.slice(0, 7)
}

export function createGeoGameService(deps: GeoGameServiceDeps): GeoGameService {
  const {
    geoScoringService,
    geoChallengeRepository,
    geoScreenshotRepository,
    geoPinRepository,
  } = deps
  const log = deps.logger.child({ service: 'geo-game' })

  return {
    async getDailyChallenge({ date, userId }) {
      const challenge = await geoChallengeRepository.findByDate(date, 1)
      if (!challenge) return null

      const meta = await geoScreenshotRepository.findMetaById(challenge.geoScreenshotMetaId)
      if (!meta) {
        log.error({ challengeId: challenge.id }, 'challenge references missing meta')
        return null
      }

      let hasGuessed = false
      if (userId) {
        const existing = await geoChallengeRepository.findGuess(userId, challenge.id)
        hasGuessed = !!existing
      }

      return { challenge, meta, hasGuessed }
    },

    async submitGuess({ userId, challengeId, guess, durationMs }) {
      if (!validPoint(guess)) {
        throw new GeoGameError('guess must have x and y in [0..1]', 'INVALID_POINT')
      }

      const existing = await geoChallengeRepository.findGuess(userId, challengeId)
      if (existing) {
        throw new GeoGameError('already guessed this challenge', 'ALREADY_GUESSED')
      }

      const challenge = await (async () => {
        // Fetch challenge + canonical via meta lookup to keep scoring pure.
        const rows = await geoChallengeRepository.listRecent(30)
        return rows.find((c) => c.id === challengeId) ?? null
      })()
      if (!challenge) {
        throw new GeoGameError('challenge not found', 'CHALLENGE_NOT_FOUND')
      }

      const meta = await geoScreenshotRepository.findMetaById(challenge.geoScreenshotMetaId)
      if (!meta) {
        throw new GeoGameError('challenge has no canonical location', 'CHALLENGE_NOT_FOUND')
      }

      const { distance, score, scoreVersion } = geoScoringService.score(guess, meta.canonical)

      const result = await geoChallengeRepository.recordGuess({
        userId,
        geoChallengeId: challengeId,
        guess,
        distance,
        score,
        scoreVersion,
        durationMs,
      })

      await geoChallengeRepository.upsertDaily({
        challengeDate: challenge.challengeDate,
        userId,
        score,
      })
      await geoChallengeRepository.upsertMonthly({
        period: monthPeriodOf(challenge.challengeDate),
        userId,
        scoreDelta: score,
      })

      return result
    },

    getLeaderboardDaily(date, limit) {
      return geoChallengeRepository.topDaily(date, limit)
    },

    getLeaderboardMonthly(period, limit) {
      return geoChallengeRepository.topMonthly(period, limit)
    },

    async pickContributionTarget({ gameId, userId }) {
      const hourly = await geoPinRepository.countByUserInWindow(userId, '1 hour')
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
