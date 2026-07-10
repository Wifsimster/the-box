import type { DomainLogger } from '../ports/logger.js'
import type {
  GeoGamersGameAttempt,
  GeoGamersGuessGameResult,
  GeoGamersGuessLocationResult,
  GeoGamersRunView,
  GeoMap,
  GeoMapOption,
  GeoPoint,
  GeoScreenshotMeta,
} from '@the-box/types'
import type {
  GameRepository,
  GeoMapRepository,
  GeoScreenshotRepository,
} from '../ports/repositories.js'
import type { FuzzyMatchService } from './fuzzy-match.service.js'
import {
  GEOGAMERS_ATTEMPTS_MAX,
  gamePointsForAttempt,
  type GeoGamersScoringService,
} from './geogamers-scoring.service.js'

// Per-phase active-time budget, mirroring the classic 45s-per-screenshot rule.
export const GEOGAMERS_PHASE_TIME_LIMIT_SECONDS = 60

// A run cannot legitimately complete faster than this. Used by claim() to
// reject implausibly fast guest runs before folding them into a season.
export const GEOGAMERS_MIN_RUN_SECONDS = 10

export class GeoGamersError extends Error {
  constructor(
    message: string,
    public code:
      | 'NO_CHALLENGE'
      | 'RUN_NOT_FOUND'
      | 'WRONG_PHASE'
      | 'ATTEMPTS_EXHAUSTED'
      | 'ALREADY_PLAYED'
      | 'JOKER_ALREADY_USED'
      | 'JOKER_NOT_ALLOWED'
      | 'NO_ALTERNATE'
      | 'CLAIM_INVALID'
      | 'INVALID_POINT'
      | 'INVALID_MAP'
      | 'NOT_AUTHENTICATED',
  ) {
    super(message)
    this.name = 'GeoGamersError'
  }
}

// ---------- Domain records + repository ports ----------
// Ports are co-located (as guess-proximity does with its fuzzy matcher) and
// implemented by the infrastructure repositories in the next phase.

export interface GeoGamersChallengeRecord {
  id: number
  challengeDate: string // YYYY-MM-DD
  geoScreenshotMetaId: number
}

export interface GeoGamersRunRecord {
  id: number
  challengeId: number
  userId: string | null
  anonymousSessionId: string | null
  runToken: string
  // Overrides the challenge meta when the joker re-rolled this run.
  geoScreenshotMetaId: number | null
  gameAttempts: GeoGamersGameAttempt[]
  gamePoints: number | null
  guess: GeoPoint | null
  distance: number | null
  locationPoints: number | null
  totalPoints: number | null
  scoreVersion: number | null
  timeSpentMs: number
  startedAt: string
  completedAt: string | null
  jokerUsed: boolean
  claimedAt: string | null
  claimedByUserId: string | null
}

export interface GeoGamersChallengeRepository {
  findCurrent(): Promise<GeoGamersChallengeRecord | null>
  findByDate(date: string): Promise<GeoGamersChallengeRecord | null>
}

export interface CreateRunInput {
  challengeId: number
  userId: string | null
  anonymousSessionId: string | null
  runToken: string
}

export interface UpdateRunInput {
  gameAttempts?: GeoGamersGameAttempt[]
  gamePoints?: number | null
  geoScreenshotMetaId?: number | null
  guess?: GeoPoint | null
  distance?: number | null
  locationPoints?: number | null
  totalPoints?: number | null
  scoreVersion?: number | null
  timeSpentMs?: number
  completedAt?: string | null
  jokerUsed?: boolean
}

export interface GeoGamersRunRepository {
  findByToken(runToken: string): Promise<GeoGamersRunRecord | null>
  findRankedForUser(challengeId: number, userId: string): Promise<GeoGamersRunRecord | null>
  create(input: CreateRunInput): Promise<GeoGamersRunRecord>
  update(runId: number, patch: UpdateRunInput): Promise<GeoGamersRunRecord>
  // Rank support: how many completed ranked runs beat `points` today.
  countCompletedBetter(challengeId: number, points: number): Promise<number>
  // Claim: copy a completed guest run into a new user-owned row and mark the
  // guest row claimed. Idempotent at the DB layer via the claim-once index.
  claimGuestRun(input: {
    guestRunId: number
    userId: string
    challengeId: number
  }): Promise<GeoGamersRunRecord | null>
}

// Records a season joker and re-rolls the run's screenshot. Enforced
// once-per-season by the (user_id, season_month) primary key.
export interface GeoGamersJokerRepository {
  hasUsed(userId: string, seasonMonth: string): Promise<boolean>
  record(input: {
    userId: string
    seasonMonth: string
    challengeId: number
    rerolledMetaId: number
  }): Promise<void>
}

// Picks an alternate eligible screenshot for a joker re-roll, excluding the
// current meta and the recent-games cooldown pool.
export interface GeoGamersAlternatePicker {
  pickAlternate(input: { excludeMetaId: number }): Promise<number | null>
}

export interface GeoGamersServiceDeps {
  logger: DomainLogger
  challengeRepo: GeoGamersChallengeRepository
  runRepo: GeoGamersRunRepository
  jokerRepo: GeoGamersJokerRepository
  alternatePicker: GeoGamersAlternatePicker
  screenshotRepo: GeoScreenshotRepository
  mapRepo: GeoMapRepository
  gameRepo: GameRepository
  fuzzyMatch: FuzzyMatchService
  scoring: GeoGamersScoringService
  // Builds the opaque proxy URL the client uses to fetch the screenshot
  // without ever seeing the underlying asset path (which can carry a slug).
  screenshotUrlFor: (runToken: string) => string
  // Injectable clock so tests are deterministic; defaults to Date.now.
  now?: () => number
}

export type GeoGamersRunPhaseComputed = 'identify' | 'locate' | 'done'

function mapToOption(map: GeoMap): GeoMapOption {
  return {
    id: map.id,
    region: map.region,
    imageUrl: map.imageUrl,
    widthPx: map.widthPx,
    heightPx: map.heightPx,
    kind: map.kind,
    tiles: map.tiles,
  }
}

function isValidPoint(p: GeoPoint): boolean {
  return (
    typeof p?.x === 'number' &&
    typeof p?.y === 'number' &&
    p.x >= 0 &&
    p.x <= 1 &&
    p.y >= 0 &&
    p.y <= 1
  )
}

/** Derive the run phase from its persisted state. */
export function computeRunPhase(run: GeoGamersRunRecord): GeoGamersRunPhaseComputed {
  if (run.completedAt) return 'done'
  const solved = run.gameAttempts.some((a) => a.correct)
  const exhausted = run.gameAttempts.length >= GEOGAMERS_ATTEMPTS_MAX
  return solved || exhausted ? 'locate' : 'identify'
}

export interface GeoGamersService {
  startOrResumeRun(input: {
    userId: string | null
    anonymousSessionId: string | null
  }): Promise<GeoGamersRunView>
  getRunByToken(runToken: string): Promise<GeoGamersRunView>
  guessGame(input: {
    runToken: string
    guess: string
    timeSpentMsDelta?: number
  }): Promise<GeoGamersGuessGameResult>
  guessLocation(input: {
    runToken: string
    geoMapId: number
    guess: GeoPoint
    timeSpentMsDelta?: number
  }): Promise<GeoGamersGuessLocationResult>
  useJoker(input: { userId: string; runToken: string }): Promise<GeoGamersRunView>
  claimRun(input: { userId: string; runToken: string }): Promise<GeoGamersRunView>
  // Raw underlying image URL for the opaque proxy route (server-side only).
  resolveScreenshotSource(runToken: string): Promise<{ imageUrl: string } | null>
}

export function createGeoGamersService(deps: GeoGamersServiceDeps): GeoGamersService {
  const log = deps.logger.child({ service: 'geogamers' })
  const now = deps.now ?? (() => Date.now())

  function seasonMonth(challengeDate: string): string {
    return challengeDate.slice(0, 7) // YYYY-MM
  }

  async function effectiveMetaId(run: GeoGamersRunRecord, challenge: GeoGamersChallengeRecord) {
    return run.geoScreenshotMetaId ?? challenge.geoScreenshotMetaId
  }

  async function loadChallengeForRun(run: GeoGamersRunRecord): Promise<GeoGamersChallengeRecord> {
    // The run references a challenge by id; the current challenge is the common
    // case, but resume/claim may target a past one — resolve by the run's own
    // challenge via the "current or by date" repos. We only expose findCurrent
    // / findByDate, so resolve current first and fall back to identity.
    const current = await deps.challengeRepo.findCurrent()
    if (current && current.id === run.challengeId) return current
    // A run should always match the current challenge in the MVP (one live
    // challenge). If not, treat as no-challenge to avoid leaking a stale meta.
    throw new GeoGamersError('challenge for run not found', 'NO_CHALLENGE')
  }

  // Build the client view, enforcing anti-leak: game/map identity is attached
  // ONLY once phase 1 has resolved (game solved or attempts exhausted).
  async function buildView(
    run: GeoGamersRunRecord,
    challenge: GeoGamersChallengeRecord,
  ): Promise<GeoGamersRunView> {
    const phase = computeRunPhase(run)
    const view: GeoGamersRunView = {
      runToken: run.runToken,
      challengeDate: challenge.challengeDate,
      phase,
      screenshotUrl: deps.screenshotUrlFor(run.runToken),
      attemptsUsed: run.gameAttempts.length,
      attemptsMax: GEOGAMERS_ATTEMPTS_MAX,
      timeLimitSeconds: GEOGAMERS_PHASE_TIME_LIMIT_SECONDS,
      timeSpentMs: run.timeSpentMs,
      jokerAvailable: false,
    }

    // Joker offer: account-only, once per season, and only before any attempt
    // is spent (a re-roll replaces the puzzle, it is not a retry).
    if (run.userId && phase === 'identify' && run.gameAttempts.length === 0 && !run.jokerUsed) {
      const used = await deps.jokerRepo.hasUsed(run.userId, seasonMonth(challenge.challengeDate))
      view.jokerAvailable = !used
    }

    if (phase !== 'identify') {
      const metaId = await effectiveMetaId(run, challenge)
      const meta = await deps.screenshotRepo.findMetaById(metaId)
      if (meta) {
        const candidate = await deps.screenshotRepo.findCandidateById(meta.geoScreenshotCandidateId)
        if (candidate) {
          const game = await deps.gameRepo.findById(candidate.gameId)
          if (game) {
            const maps = await deps.mapRepo.listEnabledByGameId(candidate.gameId)
            view.game = { id: game.id, name: game.name }
            view.maps = maps.map(mapToOption)
          }
        }
      }
      view.gamePoints = run.gamePoints ?? 0
    }

    return view
  }

  async function requireRun(runToken: string): Promise<GeoGamersRunRecord> {
    const run = await deps.runRepo.findByToken(runToken)
    if (!run) throw new GeoGamersError('run not found', 'RUN_NOT_FOUND')
    return run
  }

  return {
    async startOrResumeRun({ userId, anonymousSessionId }) {
      const challenge = await deps.challengeRepo.findCurrent()
      if (!challenge) throw new GeoGamersError('no current challenge', 'NO_CHALLENGE')

      // Ranked resume: an authenticated user has at most one run per challenge.
      if (userId) {
        const existing = await deps.runRepo.findRankedForUser(challenge.id, userId)
        if (existing) return buildView(existing, challenge)
      }

      const runToken = globalThis.crypto.randomUUID()
      const run = await deps.runRepo.create({
        challengeId: challenge.id,
        userId,
        anonymousSessionId: userId ? null : anonymousSessionId,
        runToken,
      })
      log.info({ runId: run.id, ranked: !!userId }, 'started geogamers run')
      return buildView(run, challenge)
    },

    async getRunByToken(runToken) {
      const run = await requireRun(runToken)
      const challenge = await loadChallengeForRun(run)
      return buildView(run, challenge)
    },

    async guessGame({ runToken, guess, timeSpentMsDelta }) {
      const run = await requireRun(runToken)
      const challenge = await loadChallengeForRun(run)
      const phase = computeRunPhase(run)
      if (phase !== 'identify') {
        throw new GeoGamersError('game already identified or run over', 'WRONG_PHASE')
      }

      const metaId = await effectiveMetaId(run, challenge)
      const meta = await deps.screenshotRepo.findMetaById(metaId)
      if (!meta) throw new GeoGamersError('challenge screenshot missing', 'NO_CHALLENGE')
      const candidate = await deps.screenshotRepo.findCandidateById(meta.geoScreenshotCandidateId)
      const game = candidate ? await deps.gameRepo.findById(candidate.gameId) : null
      if (!candidate || !game) throw new GeoGamersError('challenge game missing', 'NO_CHALLENGE')

      const evaluation = deps.fuzzyMatch.evaluateMatch(guess, game.name, game.aliases ?? [])
      const correct = evaluation.matched
      const attempts: GeoGamersGameAttempt[] = [
        ...run.gameAttempts,
        {
          guess,
          normalized: guess.trim().toLowerCase(),
          correct,
          at: new Date(now()).toISOString(),
        },
      ]

      // gamePoints locks when phase 1 resolves (correct guess or 3rd miss).
      const attemptNumber = attempts.length
      const exhausted = attempts.length >= GEOGAMERS_ATTEMPTS_MAX
      let gamePoints: number | null = null
      if (correct) gamePoints = gamePointsForAttempt(attemptNumber)
      else if (exhausted) gamePoints = 0

      const patch: UpdateRunInput = { gameAttempts: attempts }
      if (gamePoints !== null) patch.gamePoints = gamePoints
      if (typeof timeSpentMsDelta === 'number' && timeSpentMsDelta > 0) {
        patch.timeSpentMs = run.timeSpentMs + Math.min(timeSpentMsDelta, 5 * 60_000)
      }
      const updated = await deps.runRepo.update(run.id, patch)

      const result: GeoGamersGuessGameResult = {
        correct,
        attemptsUsed: attempts.length,
        attemptsRemaining: Math.max(0, GEOGAMERS_ATTEMPTS_MAX - attempts.length),
        run: await buildView(updated, challenge),
      }
      if (gamePoints !== null) result.gamePoints = gamePoints
      return result
    },

    async guessLocation({ runToken, geoMapId, guess, timeSpentMsDelta }) {
      const run = await requireRun(runToken)
      const challenge = await loadChallengeForRun(run)
      if (computeRunPhase(run) !== 'locate') {
        throw new GeoGamersError('not in the locate phase', 'WRONG_PHASE')
      }
      if (!isValidPoint(guess)) throw new GeoGamersError('invalid point', 'INVALID_POINT')

      const metaId = await effectiveMetaId(run, challenge)
      const meta = await deps.screenshotRepo.findMetaById(metaId)
      if (!meta) throw new GeoGamersError('challenge screenshot missing', 'NO_CHALLENGE')
      const candidate = await deps.screenshotRepo.findCandidateById(meta.geoScreenshotCandidateId)
      if (!candidate) throw new GeoGamersError('challenge screenshot missing', 'NO_CHALLENGE')

      // The chosen map must be an enabled map for this game.
      const chosenMap = await deps.mapRepo.findEnabledById(candidate.gameId, geoMapId)
      if (!chosenMap) throw new GeoGamersError('invalid map for game', 'INVALID_MAP')
      const wrongMap = chosenMap.id !== meta.geoMapId

      const scored = deps.scoring.scoreLocation(guess, meta.canonical, { wrongMap })
      const gamePoints = run.gamePoints ?? 0
      const totalPoints = gamePoints + scored.locationPoints

      let timeSpentMs = run.timeSpentMs
      if (typeof timeSpentMsDelta === 'number' && timeSpentMsDelta > 0) {
        timeSpentMs += Math.min(timeSpentMsDelta, 5 * 60_000)
      }

      const completedAt = new Date(now()).toISOString()
      const updated = await deps.runRepo.update(run.id, {
        guess,
        distance: scored.distance,
        locationPoints: scored.locationPoints,
        totalPoints,
        scoreVersion: scored.scoreVersion,
        timeSpentMs,
        completedAt,
      })

      const result: GeoGamersGuessLocationResult = {
        guess,
        canonical: meta.canonical,
        distance: scored.distance,
        locationPoints: scored.locationPoints,
        gamePoints,
        totalPoints,
        scoreVersion: scored.scoreVersion,
      }

      if (updated.userId) {
        // Live daily rank = (# completed ranked runs strictly better) + 1.
        const better = await deps.runRepo.countCompletedBetter(challenge.id, totalPoints)
        result.rank = better + 1
      } else {
        // Guests get a ghost rank instead — same computation, framed as a
        // hypothetical since the run isn't persisted into the season.
        const better = await deps.runRepo.countCompletedBetter(challenge.id, totalPoints)
        result.ghostRank = better + 1
      }
      return result
    },

    async useJoker({ userId, runToken }) {
      const run = await requireRun(runToken)
      if (!run.userId || run.userId !== userId) {
        throw new GeoGamersError('joker requires the run owner', 'NOT_AUTHENTICATED')
      }
      const challenge = await loadChallengeForRun(run)
      // A re-roll replaces the puzzle before it is engaged: identify phase,
      // no attempts spent, not already jokered on this run.
      if (
        computeRunPhase(run) !== 'identify' ||
        run.gameAttempts.length > 0 ||
        run.jokerUsed
      ) {
        throw new GeoGamersError('joker not allowed now', 'JOKER_NOT_ALLOWED')
      }
      const month = seasonMonth(challenge.challengeDate)
      if (await deps.jokerRepo.hasUsed(userId, month)) {
        throw new GeoGamersError('joker already used this season', 'JOKER_ALREADY_USED')
      }

      const currentMetaId = await effectiveMetaId(run, challenge)
      const alternate = await deps.alternatePicker.pickAlternate({ excludeMetaId: currentMetaId })
      if (!alternate) throw new GeoGamersError('no alternate screenshot available', 'NO_ALTERNATE')

      // Record first (DB PK enforces once-per-season; a race trips a unique
      // violation which the route maps to JOKER_ALREADY_USED).
      await deps.jokerRepo.record({
        userId,
        seasonMonth: month,
        challengeId: challenge.id,
        rerolledMetaId: alternate,
      })
      const updated = await deps.runRepo.update(run.id, {
        geoScreenshotMetaId: alternate,
        jokerUsed: true,
        gameAttempts: [],
      })
      log.info({ runId: run.id, alternate }, 'joker re-rolled run')
      return buildView(updated, challenge)
    },

    async claimRun({ userId, runToken }) {
      const run = await requireRun(runToken)
      const challenge = await loadChallengeForRun(run)
      // Only a completed, unclaimed GUEST run is claimable.
      if (run.userId || !run.completedAt || run.claimedAt) {
        throw new GeoGamersError('run is not claimable', 'CLAIM_INVALID')
      }
      // Timing plausibility: a run completed impossibly fast is rejected.
      const started = Date.parse(run.startedAt)
      const completed = Date.parse(run.completedAt)
      if (
        Number.isFinite(started) &&
        Number.isFinite(completed) &&
        completed - started < GEOGAMERS_MIN_RUN_SECONDS * 1000
      ) {
        throw new GeoGamersError('run completed implausibly fast', 'CLAIM_INVALID')
      }
      // The claiming account must not already have a ranked run today.
      const existing = await deps.runRepo.findRankedForUser(challenge.id, userId)
      if (existing) throw new GeoGamersError('account already played today', 'ALREADY_PLAYED')

      const claimed = await deps.runRepo.claimGuestRun({
        guestRunId: run.id,
        userId,
        challengeId: challenge.id,
      })
      if (!claimed) throw new GeoGamersError('claim failed', 'CLAIM_INVALID')
      log.info({ guestRunId: run.id, userId }, 'claimed guest run into account')
      return buildView(claimed, challenge)
    },

    async resolveScreenshotSource(runToken) {
      const run = await deps.runRepo.findByToken(runToken)
      if (!run) return null
      const challenge = await deps.challengeRepo.findCurrent()
      const metaId =
        run.geoScreenshotMetaId ?? (challenge?.id === run.challengeId ? challenge.geoScreenshotMetaId : null)
      if (metaId == null) return null
      const meta = await deps.screenshotRepo.findMetaById(metaId)
      if (!meta) return null
      const candidate = await deps.screenshotRepo.findCandidateById(meta.geoScreenshotCandidateId)
      if (!candidate) return null
      return { imageUrl: candidate.imageUrl }
    },
  }
}

// Re-export a helper used by tests / callers to check leak-safety.
export type { GeoScreenshotMeta }
