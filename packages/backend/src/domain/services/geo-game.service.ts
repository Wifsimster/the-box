import type { DomainLogger } from '../ports/logger.js'
import type {
  GeoChallengeRepository,
  GeoPinRepository,
  GeoScreenshotRepository,
  SessionRepository,
} from '../ports/repositories.js'
import type {
  GeoChallenge,
  GeoGuessResult,
  GeoLeaderboardEntry,
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
      | 'ALREADY_GUESSED'
      | 'INVALID_POINT'
      | 'NO_CANDIDATE'
      | 'CONTRIBUTE_RATE_LIMIT'
      | 'CONTRIBUTE_NOT_UNLOCKED',
  ) {
    super(message)
    this.name = 'GeoGameError'
  }
}

export const GEO_CONTRIBUTE_HOURLY_LIMIT = 20

// FR-24: require a minimum of 3 distinct completed daily-game days before a
// user can submit pins. Gates spam from drive-by accounts while still being
// low-enough that engaged players hit it fast.
export const GEO_CONTRIBUTE_MIN_DAYS_PLAYED = 3

export interface GeoDailyChallengeView {
  challenge: GeoChallenge
  meta: GeoScreenshotMeta
  // Exposed for the frontend map renderer; avoids hand-rolling image-proxy
  // endpoints. The candidate's own imageUrl is the screenshot; the map
  // carries its own image + dimensions for coordinate normalization.
  candidate: GeoScreenshotCandidate
  map: GeoMap
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
  geoMapRepository: GeoMapRepository
  sessionRepository: SessionRepository
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
    geoMapRepository,
    sessionRepository,
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

      const candidate = await geoScreenshotRepository.findCandidateById(
        meta.geoScreenshotCandidateId,
      )
      if (!candidate) {
        log.error({ metaId: meta.id }, 'meta references missing candidate')
        return null
      }

      const map = await geoMapRepository.findById(meta.geoMapId)
      if (!map) {
        log.error({ metaId: meta.id }, 'meta references missing map')
        return null
      }

      let hasGuessed = false
      if (userId) {
        const existing = await geoChallengeRepository.findGuess(userId, challenge.id)
        hasGuessed = !!existing
      }

      return { challenge, meta, candidate, map, hasGuessed }
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
      // Unlock gate first: cheaper than the rate-limit query in the hot
      // (not-yet-unlocked) path because we hit a single indexed aggregate.
      const daysPlayed = await sessionRepository.countDistinctDaysPlayed(userId)
      if (daysPlayed < GEO_CONTRIBUTE_MIN_DAYS_PLAYED) {
        throw new GeoGameError(
          `contribute unlocks after ${GEO_CONTRIBUTE_MIN_DAYS_PLAYED} days of daily-game activity (${daysPlayed}/${GEO_CONTRIBUTE_MIN_DAYS_PLAYED})`,
          'CONTRIBUTE_NOT_UNLOCKED',
        )
      }

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
