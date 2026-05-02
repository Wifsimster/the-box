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

// FR-24: require a minimum of 3 distinct completed daily-game days before a
// user can submit pins. Gates spam from drive-by accounts while still being
// low-enough that engaged players hit it fast.
export const GEO_CONTRIBUTE_MIN_DAYS_PLAYED = 3

export interface GeoDailyChallengeView {
  challenge: GeoChallenge
  meta: GeoScreenshotMeta
  // Exposed for the frontend map renderer; avoids hand-rolling image-proxy
  // endpoints. The candidate's own imageUrl is the screenshot; each map
  // carries its own image + dimensions for coordinate normalization.
  candidate: GeoScreenshotCandidate
  // All enabled maps for the challenge's game. The chooser surfaces these
  // to the player; client-side, the canvas renders whichever the player
  // has selected. Always at least one entry.
  maps: GeoMap[]
  // The map the screenshot canonically belongs to. Only populated AFTER
  // the player has guessed (so the in-progress response can't leak the
  // answer to anyone reading the network panel).
  map?: GeoMap
  hasGuessed: boolean
}

// Free-play view: any game, any enabled map, no daily-challenge gating, no
// leaderboard side effects. The chooser surface gets the full list of enabled
// maps for the game; the canonical map id is held back until after the guess
// (same DevTools-cheat protection as the daily flow).
export interface GeoFreePlayView {
  game: { id: number; name: string }
  meta: GeoScreenshotMeta
  candidate: GeoScreenshotCandidate
  maps: GeoMap[]
  // The map the screenshot canonically belongs to. Only populated AFTER the
  // player has submitted a free-play guess (i.e. it's never returned by the
  // pick endpoint). Reuses the same shape as `GeoDailyChallengeView.map`.
  map?: GeoMap
}

// Pure-scoring result for free-play. Same shape as `GeoGuessResult` minus the
// fields that only make sense in a leaderboard context (averageScore /
// playerCount). Free-play never writes to daily/monthly aggregates, so those
// stats would always be empty — we omit them rather than ship zeros.
export interface GeoFreePlayResult {
  guess: GeoPoint
  canonical: GeoPoint
  distance: number
  score: number
  scoreVersion: number
  correctMapId: number
  wrongMap: boolean
}

export interface GeoGameService {
  getDailyChallenge(args: {
    date: string
    userId?: string
  }): Promise<GeoDailyChallengeView | null>

  getCurrentChallenge(args: {
    userId?: string
  }): Promise<GeoDailyChallengeView | null>

  submitGuess(args: {
    userId: string
    challengeId: number
    // Optional only for backwards compatibility with single-map games:
    // when the challenge's game has > 1 enabled map, missing/invalid
    // values throw `INVALID_MAP`. Single-map games auto-resolve to the
    // only enabled row.
    geoMapId?: number
    guess: GeoPoint
    durationMs?: number
  }): Promise<GeoGuessResult>

  submitSkip(args: { userId: string; challengeId: number }): Promise<void>

  getLeaderboardDaily(date: string, limit?: number): Promise<GeoLeaderboardEntry[]>
  getLeaderboardMonthly(period: string, limit?: number): Promise<GeoLeaderboardEntry[]>

  pickContributionTarget(args: {
    gameId: number
    userId: string
  }): Promise<GeoScreenshotCandidate>

  // ---- Free-play (unranked, all-games-all-maps browser) ----

  pickFreePlayScreenshot(args: {
    gameId: number
    geoMapId?: number
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

// Hosts/paths used by the dev seed (`seeds/010_geo_elden_ring.ts`) that must
// never be served as a real daily challenge. The seed is guarded by
// NODE_ENV !== 'production', but if a row slips into a non-prod-flagged
// deployment we'd otherwise show players a visibly fake placeholder image.
// Treat any of these as "challenge not configured" instead.
const PLACEHOLDER_URL_PATTERNS = [
  /(^|\/\/)placehold\.co\//i,
  /(^|\/\/)via\.placeholder\.com\//i,
  /\/map-placeholder\.(jpg|jpeg|png|webp)(\?|$)/i,
]

function isPlaceholderImageUrl(url: string | null | undefined): boolean {
  if (!url) return true
  return PLACEHOLDER_URL_PATTERNS.some((p) => p.test(url))
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

  // Hydrate a challenge row into the full view (meta + candidate + maps +
  // hasGuessed). Shared between the date-pinned `/daily/:date` lookup
  // (used by history) and the current-challenge `/current` lookup (used
  // by the public geo page during slow rollout).
  //
  // Multi-map mode: returns every enabled map for the challenge's game
  // so the player can pick. The correct map (the one the screenshot
  // belongs to) is only included AFTER the player has guessed — keeping
  // it out of the in-progress payload kills the trivial DevTools cheat.
  async function hydrate(
    challenge: GeoChallenge,
    userId?: string,
  ): Promise<GeoDailyChallengeView | null> {
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

    const correctMap = await geoMapRepository.findById(meta.geoMapId)
    if (!correctMap) {
      log.error({ metaId: meta.id }, 'meta references missing map')
      return null
    }

    let maps = await geoMapRepository.listEnabledByGameId(candidate.gameId)
    // The canonical map is always part of the chooser, even if an admin
    // has temporarily disabled it after a meta was promoted — without
    // this, the player would see a chooser missing the correct answer.
    if (!maps.some((m) => m.id === correctMap.id)) {
      maps = [...maps, correctMap]
    }

    if (
      isPlaceholderImageUrl(candidate.imageUrl) ||
      maps.every((m) => isPlaceholderImageUrl(m.imageUrl))
    ) {
      log.error(
        {
          challengeId: challenge.id,
          candidateImageUrl: candidate.imageUrl,
          mapImageUrls: maps.map((m) => m.imageUrl),
        },
        'refusing to serve geo challenge backed by placeholder image URL',
      )
      return null
    }

    let hasGuessed = false
    if (userId) {
      const existing = await geoChallengeRepository.findGuess(userId, challenge.id)
      hasGuessed = !!existing
    }

    return {
      challenge,
      meta,
      candidate,
      maps,
      // Reveal only after the player has finalized their attempt.
      map: hasGuessed ? correctMap : undefined,
      hasGuessed,
    }
  }

  return {
    async getDailyChallenge({ date, userId }) {
      const challenge = await geoChallengeRepository.findByDate(date, 1)
      if (!challenge) return null
      return hydrate(challenge, userId)
    },

    async getCurrentChallenge({ userId }) {
      const challenge = await geoChallengeRepository.findCurrent(1)
      if (!challenge) return null
      return hydrate(challenge, userId)
    },

    async submitGuess({ userId, challengeId, geoMapId, guess, durationMs }) {
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

      const candidate = await geoScreenshotRepository.findCandidateById(
        meta.geoScreenshotCandidateId,
      )
      if (!candidate) {
        throw new GeoGameError('challenge has no candidate', 'CHALLENGE_NOT_FOUND')
      }

      // Resolve which map the player picked. Single-map games auto-select
      // (legacy clients can submit without `geoMapId`); multi-map games
      // require the field to be a currently-enabled map of the game.
      const enabledMaps = await geoMapRepository.listEnabledByGameId(candidate.gameId)
      let pickedMapId = geoMapId
      if (pickedMapId == null) {
        if (enabledMaps.length <= 1) {
          pickedMapId = enabledMaps[0]?.id ?? meta.geoMapId
        } else {
          throw new GeoGameError(
            'this game has multiple maps; geoMapId is required',
            'INVALID_MAP',
          )
        }
      } else if (!enabledMaps.some((m) => m.id === pickedMapId)) {
        // Allow the canonical map even if it's been disabled mid-game so
        // a player who picks the (still-rendered) correct answer is not
        // penalized by an admin's flip — anything else is rejected.
        if (pickedMapId !== meta.geoMapId) {
          throw new GeoGameError(
            'geoMapId does not belong to the challenge game',
            'INVALID_MAP',
          )
        }
      }

      const wrongMap = pickedMapId !== meta.geoMapId

      const { distance, score, scoreVersion } = geoScoringService.score(
        guess,
        meta.canonical,
        { wrongMap },
      )

      const result = await geoChallengeRepository.recordGuess({
        userId,
        geoChallengeId: challengeId,
        guess,
        distance,
        score,
        scoreVersion,
        durationMs,
        geoMapIdPicked: pickedMapId,
        wrongMap,
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

      // Stats are computed AFTER recordGuess so the player's own score is
      // included — keeps the average meaningful even when they're the
      // first guesser of the day.
      const stats = await geoChallengeRepository.getChallengeStats(challengeId)

      return { ...result, averageScore: stats.averageScore, playerCount: stats.playerCount }
    },

    async submitSkip({ userId, challengeId }) {
      // Skip shares the daily slot with submitGuess: same uniqueness
      // check, same `ALREADY_GUESSED` 409. This kills the
      // skip-then-ask-Discord-then-resubmit exploit and keeps a single
      // terminal action per challenge per user.
      const existing = await geoChallengeRepository.findGuess(userId, challengeId)
      if (existing) {
        throw new GeoGameError('already guessed this challenge', 'ALREADY_GUESSED')
      }

      const challenge = await (async () => {
        const rows = await geoChallengeRepository.listRecent(30)
        return rows.find((c) => c.id === challengeId) ?? null
      })()
      if (!challenge) {
        throw new GeoGameError('challenge not found', 'CHALLENGE_NOT_FOUND')
      }

      await geoChallengeRepository.recordSkip({ userId, geoChallengeId: challengeId })
      // Deliberately no `upsertDaily` / `upsertMonthly` — a skip is a
      // non-attempt and must never appear on the leaderboard.
    },

    getLeaderboardDaily(date, limit) {
      return geoChallengeRepository.topDaily(date, limit)
    },

    getLeaderboardMonthly(period, limit) {
      return geoChallengeRepository.topMonthly(period, limit)
    },

    // Free-play view hydration: pick a random promoted screenshot for the
    // (game, map) pair, surface every enabled map for the chooser, and
    // never write anything. Returns null when the game has no promoted
    // screenshots yet (the UI should show an empty state).
    async pickFreePlayScreenshot({ gameId, geoMapId }) {
      const enabledMaps = await geoMapRepository.listEnabledByGameId(gameId)
      if (enabledMaps.length === 0) return null
      // Validate the optional geoMapId belongs to the game's enabled set —
      // otherwise an attacker could probe arbitrary map ids by way of a
      // foreign-game request.
      if (geoMapId != null && !enabledMaps.some((m) => m.id === geoMapId)) {
        throw new GeoGameError(
          'geoMapId does not belong to the requested game',
          'INVALID_MAP',
        )
      }
      const meta = await geoScreenshotRepository.pickRandomPromotedForGame(
        gameId,
        geoMapId,
      )
      if (!meta) return null
      const candidate = await geoScreenshotRepository.findCandidateById(
        meta.geoScreenshotCandidateId,
      )
      if (!candidate) return null
      // Refuse to serve placeholder seed data — same guard as the daily flow.
      if (
        isPlaceholderImageUrl(candidate.imageUrl) ||
        enabledMaps.every((m) => isPlaceholderImageUrl(m.imageUrl))
      ) {
        return null
      }
      // Look up the game's display name from the existing maps query
      // result chain — we already know the game id; a lightweight join
      // would need a port. Keep it simple: callers that want the name
      // can join client-side with the games list.
      return {
        game: { id: gameId, name: '' },
        meta,
        candidate,
        maps: enabledMaps,
        // map: omitted — only the score endpoint reveals the canonical.
      }
    },

    // Pure scoring + canonical reveal for free-play. No leaderboard writes,
    // no socket emits, no upserts. Reuses `geoScoringService.score()` so the
    // formula stays in lockstep with daily.
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
      // The picked map must be one of the game's currently-enabled maps —
      // OR the canonical map (which may have been disabled mid-session,
      // same fallback as the daily flow so the player isn't punished by
      // an admin's flip).
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
      }
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
