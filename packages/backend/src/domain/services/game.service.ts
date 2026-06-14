import type {
  TodayChallengeResponse,
  StartChallengeResponse,
  ScreenshotResponse,
  GuessResponse,
  RevealLetterResponse,
  LetterRevealState,
  EndGameResponse,
  Game,
  NewlyEarnedAchievement,
  Screenshot,
} from '@the-box/types'
import type { DomainLogger } from '../ports/logger.js'
import type {
  ChallengeRepository,
  SessionRepository,
  ScreenshotRepository,
  UserRepository,
  InventoryRepository,
  GameRepository,
  FunnelEventRepository,
  PositionSecondChanceRepository,
  PositionLetterRevealRepository,
} from '../ports/repositories.js'
import type { FuzzyMatchService, MatchPrecision } from './fuzzy-match.service.js'
import type { AchievementService } from './achievement.service.js'
import {
  buildMaskedTitle,
  effectiveMaxReveals,
  nextPenaltyPct,
  LETTER_PENALTY_STEPS,
} from './letter-reveal.service.js'

export class GameError extends Error {
  constructor(
    public code: string,
    message: string,
    public statusCode: number = 400
  ) {
    super(message)
    this.name = 'GameError'
  }
}

const TOTAL_SCREENSHOTS = 10
const BASE_SCORE = 100
const UNFOUND_PENALTY = 0
const WRONG_GUESS_PENALTY = 0
// Fraction of the (speed-scaled, capped) score awarded for a `partial` match —
// the player named the franchise but omitted the sequel number / full subtitle.
// 0.40 is deliberately below 0.5 so the FASTEST partial (200 × 0.40 = 80) can
// never beat the SLOWEST exact (100): full identification is always strictly
// the better play. Applied after the 200 cap, before letter penalty / floor.
const PARTIAL_MATCH_FACTOR = 0.4
// Free tier no longer gets a catch-up window — only today's daily is
// playable. Premium keeps the 365-day archive. Setting this to 0 (rather
// than removing the constant) keeps the conditional shape downstream so
// the lookback math still validates "challengeDate < today" naturally.
const CATCH_UP_DAYS = 0
// Premium tier extends the catch-up window. 365 days is generous enough
// to feel like "the full archive" for end-users while still bounding the
// challenge-list query — the recurring `create-daily-challenge` job
// produces one row per day, so the upper bound on cardinality is small.
export const PREMIUM_CATCH_UP_DAYS = 365

// Letter-reveal state payload shared by getScreenshot (restore on fetch)
// and revealLetter (after a paid reveal). Pure recomputation from the
// stored integer count — the masked string is never persisted. `maxLetters`
// is the matcher-verified cap from effectiveMaxReveals, computed by the
// caller (it needs the fuzzy service + aliases).
//
// Before the first paid reveal the mask ships EMPTY: even the skeleton
// (word count + lengths) is too strong a clue to hand out for free, so it
// only unlocks together with the first revealed letter.
function buildLetterRevealState(
  gameName: string,
  maxLetters: number,
  row: { letters_revealed: number; penalty_pct: number } | null
): LetterRevealState {
  const lettersRevealed = row?.letters_revealed ?? 0
  return {
    maskedTitle: lettersRevealed > 0 ? buildMaskedTitle(gameName, lettersRevealed) : '',
    lettersRevealed,
    maxLetters,
    penaltyPct: row?.penalty_pct ?? 0,
    nextPenaltyPct: nextPenaltyPct(maxLetters, lettersRevealed),
  }
}

/**
 * Calculate speed multiplier based on time taken to find the screenshot
 * @param timeTakenMs Time in milliseconds from screenshot shown to correct guess
 * @returns Multiplier value (1.0 to 2.0)
 */
function calculateSpeedMultiplier(timeTakenMs: number): number {
  const timeTakenSeconds = timeTakenMs / 1000

  if (timeTakenSeconds < 3) {
    return 2.0 // 200 points
  } else if (timeTakenSeconds < 5) {
    return 1.75 // 175 points
  } else if (timeTakenSeconds < 10) {
    return 1.5 // 150 points
  } else if (timeTakenSeconds < 20) {
    return 1.25 // 125 points
  } else {
    return 1.0 // 100 points
  }
}

const STREAK_GRACE_COOLDOWN_DAYS = 7

export interface GameServiceDeps {
  logger: DomainLogger
  fuzzyMatchService: FuzzyMatchService
  achievementService: AchievementService
  challengeRepository: ChallengeRepository
  sessionRepository: SessionRepository
  screenshotRepository: ScreenshotRepository
  userRepository: UserRepository
  inventoryRepository: InventoryRepository
  gameRepository: GameRepository
  funnelEventRepository: FunnelEventRepository
  positionSecondChanceRepository: PositionSecondChanceRepository
  positionLetterRevealRepository: PositionLetterRevealRepository
  /**
   * Optional fire-and-forget hook called after a guess is persisted.
   * Wired by the composition root to unlock any pending rewards that
   * gate on a user action (currently: reactivation chest unlocks on
   * the user's next guess) and emit `reward:granted` over Socket.io.
   * Errors from the hook are logged but never thrown — the guess
   * submission must not fail because a side-effect failed.
   */
  onAfterGuessSubmitted?: (userId: string) => Promise<void>
  /**
   * Optional fire-and-forget hook called after a game session reaches
   * a terminal `is_completed = true` state (both natural completion and
   * forfeit). Wired by the composition root to fan out public-API
   * webhooks (M2). Same error-handling contract as
   * `onAfterGuessSubmitted` — the player's response must not fail
   * because a webhook subscriber went down.
   */
  onAfterSessionCompleted?: (params: {
    userId: string
    sessionId: string
    challengeId: number
    finalScore: number
    screenshotsFound: number
    reason: 'all_found' | 'forfeit'
    isCatchUp: boolean
  }) => Promise<void>
  /**
   * Optional fire-and-forget hook called once when a NEW game session is
   * created (not on resume). Wired by the composition root to fan out the
   * `session.started` public-API webhook. Same swallow-errors contract as
   * the hooks above.
   */
  onAfterSessionStarted?: (params: {
    userId: string
    sessionId: string
    challengeId: number
    challengeDate: string
    isCatchUp: boolean
  }) => Promise<void>
}

export interface GameService {
  getTodayChallenge(userId?: string, date?: string): Promise<TodayChallengeResponse>
  startChallenge(challengeId: number, userId: string, isPremium?: boolean): Promise<StartChallengeResponse>
  getScreenshot(
    sessionId: string,
    position: number,
    userId: string,
    prefetch?: boolean
  ): Promise<ScreenshotResponse>
  submitGuess(data: {
    tierSessionId: string
    screenshotId: number
    position: number
    gameId: number | null
    guessText: string
    roundTimeTakenMs: number
    userId: string
  }): Promise<GuessResponse>
  endGame(sessionId: string, userId: string): Promise<EndGameResponse>
  /**
   * Activate the `second_chance` powerup for a specific position. Decrements
   * inventory and records the activation atomically. Returns the result of
   * the underlying repository call so the route can return semantic 4xx
   * codes for the failure modes ('ALREADY_ACTIVE', 'NO_INVENTORY').
   *
   * **Scoring contract** (interpretation of the powerups PRD): once an
   * activation exists for `(tier_session_id, position)`, the next correct
   * guess on that position has its `scoreEarned` clamped to a FLOOR of
   * `0.7 × BASE_SCORE = 70`. We do not apply a CAP — the literal PRD
   * wording would make the powerup punitive in the current retry-friendly
   * model. See `docs/game-flow.md` for the canonical contract.
   */
  activateSecondChance(input: {
    tierSessionId: string
    position: number
    userId: string
  }): Promise<{ ok: true } | { ok: false; reason: 'ALREADY_ACTIVE' | 'NO_INVENTORY' | 'SESSION_NOT_FOUND' }>
  /**
   * Reveal one more letter of the masked title for `(tierSession, position)`.
   * Server-authoritative: the full title never leaves this layer — the
   * response carries only the recomputed masked string. The leak is metered
   * three ways:
   *   - hard cap `min(2, ceil(maskable × 0.3))` so the revealed prefix can
   *     never satisfy the fuzzy matcher on its own (ship-gate test),
   *   - gate behind one wrong guess on the position (honest attempt first;
   *     the free skeleton is visible from the start via getScreenshot),
   *   - on the ranked daily (non-catch-up) each reveal consumes one
   *     `hint_letter` inventory item — no inventory, no letters (402).
   * The score cost (15% then +20%, locked in at reveal time) applies even
   * when the item came from inventory; only premium-in-catch-up reveals
   * are free. Throws GameError: SESSION_NOT_FOUND 404, NO_INVENTORY 402,
   * LETTER_LOCKED / LETTER_CAP_REACHED / POSITION_ALREADY_SOLVED 409.
   */
  revealLetter(input: {
    tierSessionId: string
    position: number
    userId: string
    isPremium?: boolean
  }): Promise<RevealLetterResponse>
}

export function createGameService(deps: GameServiceDeps): GameService {
  const {
    fuzzyMatchService,
    achievementService,
    challengeRepository,
    sessionRepository,
    screenshotRepository,
    userRepository,
    inventoryRepository,
    gameRepository,
    funnelEventRepository,
    positionSecondChanceRepository,
    positionLetterRevealRepository,
  } = deps
  const log = deps.logger.child({ service: 'game' })

  // Score floor applied on the next correct guess after a `second_chance`
  // activation. 70 % of the BASE_SCORE per the powerups PRD; expressed as
  // an absolute integer so the math stays in sync with `scoreEarned` (also
  // an integer).
  const SECOND_CHANCE_FLOOR = 70

  async function calculateAndUpdateStreak(
    userId: string,
    user: { currentStreak: number; longestStreak?: number; lastPlayedAt?: string } | null
  ): Promise<{ currentStreak: number; longestStreak: number }> {
    // Day boundaries are UTC: challenges are dated by the daily-challenge
    // worker's getTodayDateUTC() and daily-login streaks compare UTC date
    // strings. Local midnight (the old behaviour) drifted a day in any TZ
    // ahead of UTC (e.g. Europe/Paris, the production container TZ), so a
    // player finishing every UTC day could see daysDiff 0 or 2 instead of 1.
    const today = new Date()
    today.setUTCHours(0, 0, 0, 0)

    let currentStreak = user?.currentStreak || 0
    let longestStreak = user?.longestStreak || 0
    const lastPlayedAtStr = user?.lastPlayedAt

    if (!lastPlayedAtStr) {
      currentStreak = 1
      longestStreak = Math.max(1, longestStreak)
      log.info({ userId, currentStreak, longestStreak }, 'First game - streak started')
    } else {
      const lastPlayed = new Date(lastPlayedAtStr)
      lastPlayed.setUTCHours(0, 0, 0, 0)

      const daysDiff = Math.floor((today.getTime() - lastPlayed.getTime()) / (1000 * 60 * 60 * 24))

      if (daysDiff === 0) {
        log.debug({ userId, currentStreak }, 'Same day play - streak unchanged')
      } else if (daysDiff === 1) {
        currentStreak += 1
        longestStreak = Math.max(currentStreak, longestStreak)
        log.info({ userId, currentStreak, longestStreak }, 'Streak continued')
      } else if (daysDiff === 2 && currentStreak > 0) {
        // Exactly one missed day — consume streak grace if available.
        const lastGrace = await userRepository.getStreakGraceUsedAt(userId)
        const graceAvailable =
          !lastGrace ||
          (today.getTime() - lastGrace.getTime()) / (1000 * 60 * 60 * 24) >= STREAK_GRACE_COOLDOWN_DAYS
        if (graceAvailable) {
          currentStreak += 1
          longestStreak = Math.max(currentStreak, longestStreak)
          await userRepository.markStreakGraceUsed(userId)
          log.info({ userId, currentStreak, longestStreak }, 'Streak continued via grace (1 missed day)')
        } else {
          currentStreak = 1
          log.info({ userId, daysMissed: daysDiff, lastGrace }, 'Streak reset - grace on cooldown')
        }
      } else {
        currentStreak = 1
        log.info({ userId, daysMissed: daysDiff, newStreak: currentStreak }, 'Streak reset')
      }
    }

    await userRepository.updateStreak(userId, currentStreak, longestStreak)
    log.info({ userId, currentStreak, longestStreak }, 'Streak updated in database')

    return { currentStreak, longestStreak }
  }

  return {
  async getTodayChallenge(userId?: string, date?: string): Promise<TodayChallengeResponse> {
    const today = new Date().toISOString().split('T')[0]!
    const targetDate = date || today
    log.debug({ date: targetDate, userId }, 'getTodayChallenge')

    const challenge = await challengeRepository.findByDate(targetDate)

    if (!challenge) {
      log.debug({ date: targetDate }, 'no challenge found for date')
      return {
        challengeId: null,
        date: targetDate,
        totalScreenshots: TOTAL_SCREENSHOTS,
        hasPlayed: false,
        userSession: null,
      }
    }

    let userSession = null
    if (userId) {
      const session = await sessionRepository.findGameSession(userId, challenge.id)
      if (session) {
        // Find the latest tier session for this game session
        const tierSession = await sessionRepository.findLatestTierSession(session.id)
        if (tierSession) {
          // Get correct positions for session restore
          const correctPositions = await sessionRepository.getCorrectPositions(session.id)
          userSession = {
            sessionId: session.id,
            tierSessionId: tierSession.id,
            currentPosition: session.current_position,
            isCompleted: session.is_completed,
            totalScore: session.total_score,
            correctPositions,
            screenshotsFound: correctPositions.length,
            sessionStartedAt: session.started_at.toISOString(),
            isCatchUp: session.is_catch_up,
          }
          log.debug({ userId, challengeId: challenge.id, tierSessionId: tierSession.id, hasPlayed: true, correctPositions }, 'user has existing session')
        }
      }
    }

    // Get yesterday's challenge info (only when requesting today's challenge)
    let yesterdayChallenge = null
    if (!date && userId) {
      const yesterday = new Date()
      yesterday.setDate(yesterday.getDate() - 1)
      const yesterdayDate = yesterday.toISOString().split('T')[0]!

      const yesterdayChallengeData = await challengeRepository.findByDate(yesterdayDate)
      if (yesterdayChallengeData) {
        const yesterdaySession = await sessionRepository.findGameSession(userId, yesterdayChallengeData.id)
        yesterdayChallenge = {
          challengeId: yesterdayChallengeData.id,
          date: yesterdayDate,
          hasPlayed: !!yesterdaySession,
          isCompleted: yesterdaySession?.is_completed,
        }
        log.debug({ userId, yesterdayDate, hasPlayed: !!yesterdaySession }, 'yesterday challenge info')
      }
    }

    return {
      challengeId: challenge.id,
      date: typeof challenge.challenge_date === 'string'
        ? challenge.challenge_date
        : new Date(challenge.challenge_date).toISOString().split('T')[0]!,
      totalScreenshots: TOTAL_SCREENSHOTS,
      hasPlayed: !!userSession,
      userSession,
      yesterdayChallenge,
    }
  },

  async startChallenge(
    challengeId: number,
    userId: string,
    isPremium: boolean = false,
  ): Promise<StartChallengeResponse> {
    log.info({ challengeId, userId }, 'startChallenge')

    const tiers = await challengeRepository.findTiersByChallenge(challengeId)
    const tier = tiers[0]
    if (!tier) {
      throw new GameError('CHALLENGE_NOT_FOUND', 'Challenge not found', 404)
    }

    // Get the challenge to check its date
    const challenge = await challengeRepository.findById(challengeId)
    if (!challenge) {
      throw new GameError('CHALLENGE_NOT_FOUND', 'Challenge not found', 404)
    }

    // Determine if this is a catch-up session
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    // Free tier sees the last CATCH_UP_DAYS; premium extends to
    // PREMIUM_CATCH_UP_DAYS. Outside both windows the challenge is
    // genuinely too old for anyone and we keep the original 400.
    const allowedDays = isPremium ? PREMIUM_CATCH_UP_DAYS : CATCH_UP_DAYS
    const oldestAllowed = new Date(today)
    oldestAllowed.setDate(oldestAllowed.getDate() - allowedDays)

    const challengeDate = new Date(challenge.challenge_date)
    challengeDate.setHours(0, 0, 0, 0)

    // Use UTC for the date-string comparison: the daily-challenge worker
    // dates challenges via `getTodayDateUTC()`, so `todayStr` has to come
    // from the same UTC clock. The previous code passed `today` (which
    // had `setHours(0,0,0,0)` applied — local midnight) through
    // `toISOString()`, which in any TZ ahead of UTC (e.g. Europe/Paris,
    // the production container TZ) silently rolled the date back a day
    // and flagged every fresh daily session as `is_catch_up = true`,
    // hiding it from the daily leaderboard.
    const todayStr = new Date().toISOString().split('T')[0]
    const challengeDateStr = typeof challenge.challenge_date === 'string'
      ? challenge.challenge_date
      : challengeDate.toISOString().split('T')[0]

    const isCatchUp = challengeDateStr !== todayStr
    if (isCatchUp && challengeDate < oldestAllowed) {
      // Free users have allowedDays=0, so any past challenge falls into
      // the upsell branch as long as it's still inside the premium
      // 365-day window. 402 lets the frontend route to the upsell
      // instead of rendering a generic error.
      if (!isPremium) {
        const freeOldest = new Date(today)
        freeOldest.setDate(freeOldest.getDate() - CATCH_UP_DAYS)
        if (challengeDate >= new Date(today.getTime() - PREMIUM_CATCH_UP_DAYS * 24 * 60 * 60 * 1000) && challengeDate < freeOldest) {
          throw new GameError(
            'PREMIUM_REQUIRED_FOR_OLD_CATCHUP',
            'Catch-up requires Premium',
            402,
          )
        }
      }
      throw new GameError(
        'CHALLENGE_TOO_OLD',
        `This challenge is no longer available. You can only play challenges from the last ${allowedDays} days.`,
        400,
      )
    }

    let gameSession = await sessionRepository.findGameSession(userId, challengeId)

    if (!gameSession) {
      gameSession = await sessionRepository.createGameSession({
        userId,
        dailyChallengeId: challengeId,
        isCatchUp,
      })
      log.info({ sessionId: gameSession.id, challengeId, userId, isCatchUp }, 'new game session started')
      void funnelEventRepository.record({
        eventName: 'session_started',
        userId,
        sessionId: gameSession.id,
        payload: { challengeId, isCatchUp },
      })

      // Public-API webhook fan-out (M2). Fires once per new session, never
      // on resume. Fire-and-forget — a webhook subscriber must not be able
      // to fail the start request.
      if (deps.onAfterSessionStarted) {
        void deps.onAfterSessionStarted({
          userId,
          sessionId: gameSession.id,
          challengeId,
          // `.slice(0, 10)` always yields a YYYY-MM-DD string — avoids the
          // `string | undefined` that index-access on split() would give.
          challengeDate: challengeDateStr ?? challengeDate.toISOString().slice(0, 10),
          isCatchUp,
        }).catch((error) => {
          log.warn(
            { userId, error: String(error) },
            'onAfterSessionStarted hook failed (non-fatal)',
          )
        })
      }
    } else {
      // Check if session is already completed
      if (gameSession.is_completed) {
        throw new GameError('CHALLENGE_ALREADY_COMPLETED', 'You have already completed this challenge', 400)
      }
      log.debug({ sessionId: gameSession.id, challengeId, userId }, 'resuming existing session')
    }

    // Use the atomic guarded insert so a concurrent submitGuess that flips
    // is_completed=true between the read above and this write cannot grant
    // the user a second tier-session run.
    const tierSession = await sessionRepository.createTierSessionIfActive({
      gameSessionId: gameSession.id,
      tierId: tier.id,
    })
    if (!tierSession) {
      throw new GameError('CHALLENGE_ALREADY_COMPLETED', 'You have already completed this challenge', 400)
    }

    return {
      sessionId: gameSession.id,
      tierSessionId: tierSession.id,
      totalScreenshots: TOTAL_SCREENSHOTS,
      sessionStartedAt: gameSession.started_at.toISOString(),
    }
  },

  async getScreenshot(
    sessionId: string,
    position: number,
    userId: string,
    prefetch: boolean = false
  ): Promise<ScreenshotResponse> {
    const session = await sessionRepository.findGameSessionById(sessionId, userId)
    if (!session) {
      throw new GameError('SESSION_NOT_FOUND', 'Session not found', 404)
    }

    // Find the single tier for this challenge
    const tiers = await challengeRepository.findTiersByChallenge(session.daily_challenge_id)
    const tier = tiers[0]
    if (!tier) {
      throw new GameError('CHALLENGE_NOT_FOUND', 'Challenge not found', 404)
    }

    const tierScreenshot = await challengeRepository.findScreenshotAtPosition(tier.id, position)
    if (!tierScreenshot) {
      throw new GameError('SCREENSHOT_NOT_FOUND', 'Screenshot not found', 404)
    }

    // Server-authoritative round timer. Stamp the moment we hand this
    // position to the client so submitGuess can compute elapsed without
    // trusting the client. Failure here is fail-closed: previously this
    // path swallowed the error and let submitGuess fall back to the
    // client-supplied timer, which re-enabled the original
    // `{ roundTimeTakenMs: 1 }` cheat any time the DB blipped.
    //
    // Prefetch calls (carousel prev/next warming, full-batch warming on
    // session resume) skip the stamp: stamping here would clobber
    // `round_position` to the prefetched slot and the user's next
    // submitGuess on the *current* position would 409 with
    // ROUND_NOT_STARTED. The client cannot weaponise prefetch=1 — the
    // stamp is the only way to enable scoring, so a malicious caller
    // that always passes prefetch=1 simply locks itself out.
    const latestTier = await sessionRepository.findLatestTierSession(session.id)
    if (!latestTier) {
      throw new GameError(
        'SESSION_NOT_FOUND',
        'No active round for this session; restart the challenge.',
        409
      )
    }
    if (!prefetch) {
      await sessionRepository.markRoundStarted(latestTier.id, position)
    }

    // Use proxy URL to hide the actual file path (which contains game slug)
    const proxyImageUrl = `/api/game/image/${tierScreenshot.screenshot_id}`

    // Masked-title state for the letter-reveal hint. Until the first paid
    // reveal the mask ships empty (even the word count + lengths skeleton
    // stays hidden); any letters the player already paid for in this
    // session are restored from position_letter_reveals so
    // refresh/navigation can't reset (or re-charge) the mask. Only the
    // masked string ships — never the title.
    let letterReveal: LetterRevealState | undefined
    const screenshotWithGame = await screenshotRepository.findWithGame(
      tierScreenshot.screenshot_id
    )
    if (screenshotWithGame) {
      const revealRow = await positionLetterRevealRepository.find(latestTier.id, position)
      const maxLetters = effectiveMaxReveals(screenshotWithGame.gameName, (input, name) =>
        fuzzyMatchService.isMatch(input, name, screenshotWithGame.aliases)
      )
      letterReveal = buildLetterRevealState(screenshotWithGame.gameName, maxLetters, revealRow)
    }

    return {
      screenshotId: tierScreenshot.screenshot_id,
      position: tierScreenshot.position,
      imageUrl: proxyImageUrl,
      bonusMultiplier: parseFloat(tierScreenshot.bonus_multiplier),
      // Expose the per-screenshot countdown limit so the client can run the
      // round timer. Falls back to 45s if a legacy tier has no value.
      timeLimitSeconds: tier.time_limit_seconds ?? 45,
      letterReveal,
    }
  },

  async submitGuess(data: {
    tierSessionId: string
    screenshotId: number
    position: number
    gameId: number | null
    guessText: string
    roundTimeTakenMs: number
    userId: string
  }): Promise<GuessResponse> {
    // Serialise the whole submission against other concurrent calls for
    // the same tier_session. Without this, two rapid POSTs (two tabs, a
    // double-click bot, a retry-on-timeout) could interleave reads of
    // the tier_session row, double-apply the second-chance floor in
    // memory, or leave wrong_guesses out of sync with the guesses
    // table. The Postgres advisory transaction lock releases
    // automatically on commit / rollback so we don't need a finally.
    return sessionRepository.withTierSessionLock(data.tierSessionId, async (): Promise<GuessResponse> => {
    log.debug({ tierSessionId: data.tierSessionId, position: data.position, userId: data.userId }, 'submitGuess')

    const tierSession = await sessionRepository.findTierSessionWithContext(data.tierSessionId)

    if (!tierSession || tierSession.user_id !== data.userId) {
      throw new GameError('SESSION_NOT_FOUND', 'Session not found', 404)
    }

    // Anti-replay: a position can only be SOLVED once. The round-timer guard
    // below only checks `round_position === data.position`, and that field is
    // never cleared after a correct guess — so without this check a client
    // could re-POST the same winning answer for an already-solved slot,
    // re-banking score and inserting a second correct row (which also
    // inflated the completion tally). Wrong guesses may still repeat; we only
    // block re-scoring a position that already has a correct guess. Running
    // inside the tier-session advisory lock makes this check-then-insert
    // race-safe against two concurrent winning submits.
    if (await sessionRepository.hasCorrectGuessForPosition(data.tierSessionId, data.position)) {
      throw new GameError(
        'POSITION_ALREADY_SOLVED',
        'This screenshot has already been solved.',
        409
      )
    }

    const screenshotData = await screenshotRepository.findWithGame(data.screenshotId)
    if (!screenshotData) {
      throw new GameError('SCREENSHOT_NOT_FOUND', 'Screenshot not found', 404)
    }

    const { screenshot, gameName, coverImageUrl, aliases, releaseYear, metacritic } = screenshotData

    // Correctness requires non-empty text. The gameId path used to win on
    // its own; combined with the image-proxy enumeration that lets any
    // logged-in user discover screenshot→gameId, an empty-text submit
    // with a known gameId was a one-shot answer leak. Force at least a
    // text attempt; fuzzy-match wins on its own, gameId is now only a
    // tiebreaker for ambiguous text (e.g. autocomplete picks).
    const trimmedGuess = data.guessText.trim()
    // Graded match. `exact` = full title; `partial` = franchise named but
    // sequel number / subtitle omitted (solves the position at a reduced
    // score). A picked autocomplete result (gameId) is a definitive selection,
    // so it counts as `exact`. A wrong number / unrelated guess stays `none`.
    const matchResult =
      trimmedGuess !== ''
        ? fuzzyMatchService.evaluateMatch(data.guessText, gameName, aliases)
        : { matched: false, precision: 'none' as MatchPrecision }
    const precision: MatchPrecision =
      matchResult.precision !== 'none'
        ? matchResult.precision
        : trimmedGuess !== '' && data.gameId === screenshot.gameId
          ? 'exact'
          : 'none'
    const isCorrect = precision !== 'none'

    // Server-authoritative round timer. The client submits its own
    // `roundTimeTakenMs`; we treat it as a hint and use Math.max(server,
    // client) so the slower of the two wins. Lower elapsed time = higher
    // speed multiplier, so favouring the larger value blocks the trivial
    // `{ roundTimeTakenMs: 1 }` cheat without penalising legitimate users
    // whose clock differs slightly from ours.
    //
    // We require valid round metadata before scoring. The previous
    // fallback ("if NULL, trust the client") opened a window any time
    // the DB blipped during getScreenshot or the user POSTed
    // out-of-order; refuse the submit instead.
    if (
      tierSession.round_started_at == null ||
      tierSession.round_position !== data.position
    ) {
      throw new GameError(
        'ROUND_NOT_STARTED',
        'No active round timer for this position. Reload the screenshot and retry.',
        409
      )
    }
    const roundStartedAt = new Date(tierSession.round_started_at).getTime()
    const serverElapsedMs = Math.max(0, Date.now() - roundStartedAt)
    const effectiveTimeTakenMs = Math.max(serverElapsedMs, data.roundTimeTakenMs)
    if (Math.abs(serverElapsedMs - data.roundTimeTakenMs) > 2000) {
      log.warn?.(
        {
          userId: data.userId,
          tierSessionId: data.tierSessionId,
          position: data.position,
          serverElapsedMs,
          clientElapsedMs: data.roundTimeTakenMs,
        },
        'round timer divergence (>2s)'
      )
    }

    // Calculate score based on speed multiplier (only for correct guesses)
    // Base score is 100 points, multiplied by speed factor
    let scoreEarned = 0
    if (isCorrect) {
      const speedMultiplier = calculateSpeedMultiplier(effectiveTimeTakenMs)
      scoreEarned = Math.round(BASE_SCORE * speedMultiplier)
      // Cap max score per screenshot at 200 points
      scoreEarned = Math.min(scoreEarned, 200)
      // Franchise-only identification earns a fraction of the full score. The
      // factor is applied AFTER the cap so partial tops out at 80, never 200.
      if (precision === 'partial') {
        scoreEarned = Math.round(scoreEarned * PARTIAL_MATCH_FACTOR)
      }
    }

    // Letter-reveal penalty — the cumulative percent was locked in at
    // reveal time (POST /reveal-letter) and is deducted here exactly once,
    // on the correct guess. Ordering contract: after the speed-multiplier
    // cap, BEFORE the second-chance floor — a paid floor still wins over
    // letter costs. Re-deduction on a later guess is blocked by the
    // POSITION_ALREADY_SOLVED anti-replay guard.
    let letterPenalty = 0
    let pendingLetterRevealId: number | null = null
    if (isCorrect) {
      const letterReveal = await positionLetterRevealRepository.findPending(
        data.tierSessionId,
        data.position
      )
      if (letterReveal) {
        pendingLetterRevealId = letterReveal.id
        if (letterReveal.penalty_pct > 0) {
          letterPenalty = Math.round((scoreEarned * letterReveal.penalty_pct) / 100)
          scoreEarned -= letterPenalty
          log.info(
            {
              userId: data.userId,
              position: data.position,
              lettersRevealed: letterReveal.letters_revealed,
              penaltyPct: letterReveal.penalty_pct,
              penalty: letterPenalty,
            },
            'letter-reveal penalty applied'
          )
        }
      }
    }

    // Second-chance score floor — applies to the next correct guess on
    // a position where the user previously activated the powerup. The
    // activation row is created by POST /api/game/second-chance and lives
    // in `position_second_chances`. We treat 70 % of BASE_SCORE as a
    // FLOOR (not a cap, despite the literal PRD wording — see service
    // contract above). The activation is marked applied AFTER the guess
    // is saved so the row's `applied_to_guess_id` points at the
    // surviving guess record.
    let secondChanceFloorBoost: number | undefined
    let pendingSecondChanceActivationId: number | null = null
    if (isCorrect) {
      const activation = await positionSecondChanceRepository.findPending(
        data.tierSessionId,
        data.position
      )
      if (activation) {
        pendingSecondChanceActivationId = activation.id
        if (scoreEarned < SECOND_CHANCE_FLOOR) {
          secondChanceFloorBoost = SECOND_CHANCE_FLOOR - scoreEarned
          scoreEarned = SECOND_CHANCE_FLOOR
          log.info(
            {
              userId: data.userId,
              position: data.position,
              boost: secondChanceFloorBoost,
              floor: SECOND_CHANCE_FLOOR,
            },
            'second_chance floor applied'
          )
        }
      }
    }

    // Calculate wrong guess penalty
    let wrongGuessPenalty = 0
    if (!isCorrect) {
      wrongGuessPenalty = WRONG_GUESS_PENALTY
    }

    // Update session score: add earned score, subtract wrong guess penalty
    const newSessionScore = Math.max(0, tierSession.score + scoreEarned - wrongGuessPenalty)

    // Track wrong guesses count
    const newWrongGuesses = tierSession.wrong_guesses + (isCorrect ? 0 : 1)

    log.info(
      {
        userId: data.userId,
        position: data.position,
        isCorrect,
        scoreEarned,
        clientRoundTimeTakenMs: data.roundTimeTakenMs,
        effectiveTimeTakenMs,
        serverElapsedMs,
        speedMultiplier: isCorrect ? calculateSpeedMultiplier(effectiveTimeTakenMs) : null,
        guessedGame: data.guessText,
        correctGame: gameName,
      },
      'guess submitted'
    )

    await sessionRepository.saveGuess({
      tierSessionId: data.tierSessionId,
      screenshotId: data.screenshotId,
      position: data.position,
      guessedGameId: data.gameId,
      guessedText: data.guessText,
      isCorrect,
      // Persist the server-derived elapsed so historical rows reflect what
      // actually drove the score, not the client's self-report.
      sessionElapsedMs: effectiveTimeTakenMs,
      scoreEarned,
      // Legacy metadata hints are retired — new guesses always persist
      // null. The column (and historical non-null values) stay untouched
      // for history-display and recalculation paths.
      powerUpUsed: null,
      hintFromInventory: false,
    })

    if (pendingSecondChanceActivationId !== null) {
      // Best-effort traceability link. We keep `applied_to_guess_id` null
      // (saveGuess doesn't return the new row id) — the activation row
      // is now flagged "applied" so future correct guesses on this slot
      // (e.g. retried after navigation) won't re-floor.
      await positionSecondChanceRepository.markApplied(
        pendingSecondChanceActivationId,
        null
      )
    }

    if (pendingLetterRevealId !== null) {
      // Same best-effort link as the second-chance row above; the real
      // double-deduction guard is the anti-replay check on solved slots.
      await positionLetterRevealRepository.markApplied(pendingLetterRevealId, null)
    }

    // Fire-and-forget reactivation chest unlock + any other post-guess
    // reward side-effects. Wired in the composition root so this domain
    // service stays infrastructure-free (no socket import here).
    if (deps.onAfterGuessSubmitted) {
      void deps.onAfterGuessSubmitted(data.userId).catch((error) => {
        log.warn(
          { userId: data.userId, error: String(error) },
          'onAfterGuessSubmitted hook failed (non-fatal)'
        )
      })
    }

    void funnelEventRepository.record({
      eventName: 'guess_submitted',
      userId: data.userId,
      sessionId: tierSession.game_session_id,
      payload: {
        position: data.position,
        isCorrect,
        roundTimeTakenMs: effectiveTimeTakenMs,
        // Retired field, kept in the payload shape so funnel queries that
        // segment on it keep working across the retirement boundary.
        powerUpUsed: null,
      },
    })

    await sessionRepository.updateTierSession(data.tierSessionId, {
      score: newSessionScore,
      correctAnswers: tierSession.correct_answers + (isCorrect ? 1 : 0),
      wrongGuesses: newWrongGuesses,
    })

    // Count of screenshots found (distinct solved positions). This runs AFTER
    // `saveGuess` above has already persisted the current guess (the insert
    // autocommits on its pooled connection before this read), so the current
    // correct guess is already included — we must NOT add it again. The old
    // `+ (isCorrect ? 1 : 0)` double-counted it and ended the challenge after
    // 9 of 10 screenshots.
    const totalScreenshotsFound = await sessionRepository.getCorrectAnswersCount(data.tierSessionId)

    // Advance to next position only on correct guess
    const shouldAdvance = isCorrect

    // Calculate completion
    let isCompleted = false
    let completionReason: 'all_found' | undefined

    if (totalScreenshotsFound >= TOTAL_SCREENSHOTS) {
      isCompleted = true
      completionReason = 'all_found'
    }

    // Calculate next position
    const nextPosition = shouldAdvance
      ? (data.position < TOTAL_SCREENSHOTS ? data.position + 1 : null)
      : data.position // Stay on same position if tries remaining

    // Update game session with locked-in score (includes wrong guess penalty)
    const newTotalScore = Math.max(0, tierSession.game_total_score + scoreEarned - wrongGuessPenalty)
    await sessionRepository.updateGameSession(tierSession.game_session_id, {
      totalScore: newTotalScore,
      currentPosition: nextPosition ?? data.position,
      isCompleted,
    })

    if (isCompleted) {
      log.info(
        {
          userId: data.userId,
          sessionId: tierSession.game_session_id,
          finalScore: newTotalScore,
          screenshotsFound: totalScreenshotsFound,
          completionReason
        },
        'game completed'
      )

      void funnelEventRepository.record({
        eventName: 'session_completed',
        userId: data.userId,
        sessionId: tierSession.game_session_id,
        payload: {
          finalScore: newTotalScore,
          screenshotsFound: totalScreenshotsFound,
          completionReason,
        },
      })

      // Public-API webhook fan-out (M2). Fire-and-forget; webhook delivery
      // errors must not fail the guess submission.
      if (deps.onAfterSessionCompleted) {
        void deps.onAfterSessionCompleted({
          userId: data.userId,
          sessionId: tierSession.game_session_id,
          challengeId: tierSession.daily_challenge_id,
          finalScore: newTotalScore,
          screenshotsFound: totalScreenshotsFound,
          reason: 'all_found',
          isCatchUp: tierSession.is_catch_up,
        }).catch((error) => {
          log.warn(
            { userId: data.userId, error: String(error) },
            'onAfterSessionCompleted hook failed (non-fatal)',
          )
        })
      }

      // Check achievements after game completion
      let newlyEarnedAchievements: any[] = []
      try {
        // Get user info for streak data
        const user = await userRepository.findById(data.userId)

        // Calculate and update streak
        const updatedStreak = await calculateAndUpdateStreak(data.userId, user)

        // Update user's total score
        log.info({ userId: data.userId, scoreToAdd: newTotalScore }, 'Updating user total score')
        await userRepository.updateScore(data.userId, newTotalScore)

        const allGuesses = await sessionRepository.findAchievementGuessData(tierSession.game_session_id)
        const gameGenres = await gameRepository.getGenresById(screenshot.gameId)

        newlyEarnedAchievements = await achievementService.checkAchievementsAfterGame({
          userId: data.userId,
          sessionId: tierSession.game_session_id,
          challengeId: tierSession.daily_challenge_id,
          totalScore: newTotalScore,
          guesses: allGuesses,
          gameGenres,
          currentStreak: updatedStreak.currentStreak,
          longestStreak: updatedStreak.longestStreak,
        })
      } catch (error) {
        log.error({ error, userId: data.userId }, 'Failed to check achievements')
      }

      // Return response with achievements
      const correctGame: Game = {
        id: screenshot.gameId,
        name: gameName,
        slug: '',
        aliases: [],
        coverImageUrl,
        releaseYear,
        metacritic,
      }

      const fullGameData = await screenshotRepository.getGameByScreenshotId(data.screenshotId)

      if (fullGameData) {
        correctGame.publisher = fullGameData.publisher ?? undefined
        correctGame.developer = fullGameData.developer ?? undefined
      }

      return {
        isCorrect,
        correctGame,
        scoreEarned,
        totalScore: newTotalScore,
        screenshotsFound: totalScreenshotsFound,
        nextPosition,
        isCompleted,
        completionReason,
        letterPenalty: letterPenalty > 0 ? letterPenalty : undefined,
        wrongGuessPenalty: wrongGuessPenalty > 0 ? wrongGuessPenalty : undefined,
        secondChanceFloorBoost,
        matchPrecision: isCorrect ? (precision as 'exact' | 'partial') : undefined,
        newlyEarnedAchievements: newlyEarnedAchievements.length > 0 ? newlyEarnedAchievements : undefined,
      }
    }

    const correctGame: Game = {
      id: screenshot.gameId,
      name: gameName,
      slug: '',
      aliases: [],
      coverImageUrl,
      releaseYear,
      metacritic,
    }

    // Get full game data for hints (developer and publisher)
    const fullGameData = await screenshotRepository.getGameByScreenshotId(data.screenshotId)

    // Add publisher and developer to correctGame if available
    if (fullGameData) {
      correctGame.publisher = fullGameData.publisher ?? undefined
      correctGame.developer = fullGameData.developer ?? undefined
    }

    return {
      isCorrect,
      // Anti-leak gate: a wrong guess must not hand back the answer
      // (name + metadata) — that free harvest path would make the
      // metered letter reveal meaningless.
      correctGame: isCorrect ? correctGame : undefined,
      scoreEarned,
      totalScore: newTotalScore,
      screenshotsFound: totalScreenshotsFound,
      nextPosition,
      isCompleted,
      completionReason,
      letterPenalty: letterPenalty > 0 ? letterPenalty : undefined,
      wrongGuessPenalty: wrongGuessPenalty > 0 ? wrongGuessPenalty : undefined,
      secondChanceFloorBoost,
      matchPrecision: isCorrect ? (precision as 'exact' | 'partial') : undefined,
    }
    }) // end withTierSessionLock
  },

  async revealLetter(input: {
    tierSessionId: string
    position: number
    userId: string
    isPremium?: boolean
  }): Promise<RevealLetterResponse> {
    const { tierSessionId, position, userId, isPremium } = input
    // The tier-session advisory lock serialises reveals against each other
    // AND against submitGuess, so the read-compute-write of the penalty
    // step can't interleave and a reveal can't race a winning guess.
    return sessionRepository.withTierSessionLock(tierSessionId, async (): Promise<RevealLetterResponse> => {
      log.info({ tierSessionId, position, userId }, 'revealLetter')

      const tierSession = await sessionRepository.findTierSessionWithContext(tierSessionId)
      if (!tierSession || tierSession.user_id !== userId) {
        throw new GameError('SESSION_NOT_FOUND', 'Session not found', 404)
      }

      // No buying letters for a slot that is already solved.
      if (await sessionRepository.hasCorrectGuessForPosition(tierSessionId, position)) {
        throw new GameError(
          'POSITION_ALREADY_SOLVED',
          'This screenshot has already been solved.',
          409
        )
      }

      const tiers = await challengeRepository.findTiersByChallenge(tierSession.daily_challenge_id)
      const tier = tiers[0]
      if (!tier) {
        throw new GameError('CHALLENGE_NOT_FOUND', 'Challenge not found', 404)
      }
      const tierScreenshot = await challengeRepository.findScreenshotAtPosition(tier.id, position)
      if (!tierScreenshot) {
        throw new GameError('SCREENSHOT_NOT_FOUND', 'Screenshot not found', 404)
      }
      const screenshotWithGame = await screenshotRepository.findWithGame(
        tierScreenshot.screenshot_id
      )
      if (!screenshotWithGame) {
        throw new GameError('SCREENSHOT_NOT_FOUND', 'Screenshot not found', 404)
      }
      const { gameName, aliases } = screenshotWithGame

      // Matcher-verified cap: never reveal a fragment the fuzzy matcher
      // would accept as a winning guess (the no-leak ship gate).
      const maxLetters = effectiveMaxReveals(gameName, (input, name) =>
        fuzzyMatchService.isMatch(input, name, aliases)
      )
      const existing = await positionLetterRevealRepository.find(tierSessionId, position)
      const current = existing?.letters_revealed ?? 0
      if (current >= maxLetters) {
        throw new GameError(
          'LETTER_CAP_REACHED',
          'No more letters can be revealed for this screenshot.',
          409
        )
      }

      // Hybrid gate: the free skeleton is always visible, but the first
      // PAID letter requires one honest attempt on the position.
      if (!(await sessionRepository.hasWrongGuessForPosition(tierSessionId, position))) {
        throw new GameError(
          'LETTER_LOCKED',
          'Make at least one guess on this screenshot before revealing letters.',
          409
        )
      }

      // Premium entitlement zeroes the score cost in catch-up sessions
      // only — never on today's daily (ranked integrity is
      // non-negotiable).
      const premiumFree = !!isPremium && !!tierSession.is_catch_up

      // Ranked daily is inventory-gated: every reveal burns one
      // `hint_letter` item so letter help is bounded by what the streak
      // economy hands out. 402 routes the frontend to the upsell, like
      // second-chance. Catch-up sessions don't touch inventory — they
      // never feed the leaderboard.
      let fromInventory = false
      if (!tierSession.is_catch_up) {
        const hasItem = await inventoryRepository.useItems(userId, 'powerup', 'hint_letter', 1)
        if (!hasItem) {
          throw new GameError(
            'NO_INVENTORY',
            'No letter-reveal power-up in inventory.',
            402
          )
        }
        fromInventory = true
      }

      // Score cost applies even when the item came from inventory — the
      // economy contract for letters is "always costs score" so login
      // streaks can't trivialise the leaderboard. Premium-in-catch-up is
      // the single free path.
      const penaltyStep = premiumFree
        ? 0
        : LETTER_PENALTY_STEPS[Math.min(current, LETTER_PENALTY_STEPS.length - 1)]!

      const row = await positionLetterRevealRepository.recordReveal({
        tierSessionId,
        position,
        addPenaltyPct: penaltyStep,
      })

      void funnelEventRepository.record({
        eventName: 'letter_revealed',
        userId,
        sessionId: tierSession.game_session_id,
        payload: {
          position,
          lettersRevealed: row.letters_revealed,
          penaltyPct: row.penalty_pct,
          fromInventory,
          premiumFree,
        },
      })

      return {
        ...buildLetterRevealState(gameName, maxLetters, row),
        fromInventory,
      }
    })
  },

  async activateSecondChance(input: {
    tierSessionId: string
    position: number
    userId: string
  }): Promise<{ ok: true } | { ok: false; reason: 'ALREADY_ACTIVE' | 'NO_INVENTORY' | 'SESSION_NOT_FOUND' }> {
    const { tierSessionId, position, userId } = input
    log.info({ tierSessionId, position, userId }, 'activateSecondChance')

    // Validate session ownership before touching inventory.
    const ts = await sessionRepository.findTierSessionWithContext(tierSessionId)
    if (!ts || ts.user_id !== userId) {
      return { ok: false, reason: 'SESSION_NOT_FOUND' }
    }

    const result = await positionSecondChanceRepository.activate({
      userId,
      tierSessionId,
      position,
    })
    return result.ok ? { ok: true } : { ok: false, reason: result.reason }
  },


  async endGame(sessionId: string, userId: string): Promise<EndGameResponse> {
    log.info({ sessionId, userId }, 'endGame')

    // Find and validate game session
    const session = await sessionRepository.findGameSessionById(sessionId, userId)
    if (!session) {
      throw new GameError('SESSION_NOT_FOUND', 'Session not found', 404)
    }

    if (session.is_completed) {
      throw new GameError('SESSION_ALREADY_COMPLETED', 'Session already completed', 400)
    }

    // Anti-cheat: a fresh session with no guesses must not be allowed to
    // flag itself completed. Otherwise a player can `start` + `end`
    // immediately and read `unfoundGames` (all 10 game names) for free.
    // The forfeit path is still legitimate once the player has actually
    // attempted at least one position.
    const guessCount = await sessionRepository.countGuessesBySession(sessionId)
    if (guessCount === 0) {
      throw new GameError(
        'SESSION_HAS_NO_PROGRESS',
        'Cannot forfeit a session without attempting any guess',
        400,
      )
    }

    // Get correct positions to calculate unfound count
    const correctPositions = await sessionRepository.getCorrectPositions(sessionId)
    const screenshotsFound = correctPositions.length
    const unfoundCount = TOTAL_SCREENSHOTS - screenshotsFound

    // Calculate penalty
    const penaltyApplied = unfoundCount * UNFOUND_PENALTY

    // Calculate final score (allow negative)
    const finalScore = session.total_score - penaltyApplied

    // Get unfound games with screenshot and game data
    const unfoundGames: Array<{ position: number; game: Game; screenshot: Screenshot }> = []
    if (unfoundCount > 0) {
      // Get the tier for this challenge
      const tiers = await challengeRepository.findTiersByChallenge(session.daily_challenge_id)
      const tier = tiers[0]
      if (tier) {
        const allTierScreenshots = await challengeRepository.findTierScreenshotsExcludingPositions(
          tier.id,
          correctPositions
        )
        for (const row of allTierScreenshots) {
          unfoundGames.push(row)
        }
      }
    }

    // Mark session as completed
    await sessionRepository.updateGameSession(sessionId, {
      totalScore: finalScore,
      currentPosition: session.current_position,
      isCompleted: true,
    })

    // Check achievements after game completion (forfeit)
    let newlyEarnedAchievements: NewlyEarnedAchievement[] = []
    try {
      const user = await userRepository.findById(userId)

      // Calculate and update streak
      const updatedStreak = await calculateAndUpdateStreak(userId, user)

      // Update user's total score
      log.info({ userId, scoreToAdd: finalScore }, 'Updating user total score (forfeit)')
      await userRepository.updateScore(userId, finalScore)

      const allGuesses = await sessionRepository.findAchievementGuessData(sessionId)
      const gameGenres = await gameRepository.getGenresByScreenshotIds(
        allGuesses.map(g => g.screenshotId)
      )

      newlyEarnedAchievements = await achievementService.checkAchievementsAfterGame({
        userId,
        sessionId: sessionId,
        challengeId: session.daily_challenge_id,
        totalScore: finalScore,
        guesses: allGuesses,
        gameGenres,
        currentStreak: updatedStreak.currentStreak,
        longestStreak: updatedStreak.longestStreak,
      })
    } catch (error) {
      log.error({ error, userId }, 'Failed to check achievements on forfeit')
    }

    log.info(
      {
        userId,
        sessionId,
        finalScore,
        screenshotsFound,
        unfoundCount,
        penaltyApplied,
        completionReason: 'forfeit'
      },
      'game ended by user (forfeit)'
    )

    void funnelEventRepository.record({
      eventName: 'session_abandoned',
      userId,
      sessionId,
      payload: { finalScore, screenshotsFound, unfoundCount },
    })

    // Public-API webhook fan-out (M2). Forfeit is still a terminal
    // completion — receivers get the same shape as `all_found`, with
    // `reason: 'forfeit'` differentiating the path.
    if (deps.onAfterSessionCompleted) {
      void deps.onAfterSessionCompleted({
        userId,
        sessionId,
        challengeId: session.daily_challenge_id,
        finalScore,
        screenshotsFound,
        reason: 'forfeit',
        isCatchUp: session.is_catch_up,
      }).catch((error) => {
        log.warn(
          { userId, error: String(error) },
          'onAfterSessionCompleted hook failed (non-fatal)',
        )
      })
    }

    return {
      totalScore: finalScore,
      screenshotsFound,
      unfoundCount,
      penaltyApplied,
      isCompleted: true,
      completionReason: 'forfeit',
      unfoundGames,
      newlyEarnedAchievements:
        newlyEarnedAchievements.length > 0 ? newlyEarnedAchievements : undefined,
    }
  },
  }
}
