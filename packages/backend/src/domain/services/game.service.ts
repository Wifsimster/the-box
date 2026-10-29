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
  GameSessionStore,
  ScreenshotRepository,
  GamePlayerStore,
  InventoryRepository,
  GameplayGameQuery,
  FunnelEventRepository,
  PositionSecondChanceRepository,
  PositionLetterRevealRepository,
  TierSessionWithContextRecord,
} from '../ports/repositories.js'
import type { FuzzyMatchService } from './fuzzy-match.service.js'
import type { AchievementService } from './achievement.service.js'
import {
  buildMaskedTitle,
  effectiveMaxReveals,
  nextPenaltyPct,
  LETTER_PENALTY_STEPS,
} from './letter-reveal.service.js'
import { computeGuessProximityHint } from './guess-proximity.service.js'
import { resolveMatchPrecision, resolveRoundTimer } from './guess-validation.service.js'
import {
  SECOND_CHANCE_FLOOR,
  calculateGuessScore,
  calculateStreakBonus,
} from './guess-scoring.service.js'

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
const UNFOUND_PENALTY = 0
const WRONG_GUESS_PENALTY = 0
const CATCH_UP_DAYS = 0
export const PREMIUM_CATCH_UP_DAYS = 365

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


const STREAK_GRACE_COOLDOWN_DAYS = 7

export interface GameServiceDeps {
  logger: DomainLogger
  fuzzyMatchService: FuzzyMatchService
  achievementService: AchievementService
  challengeRepository: ChallengeRepository
  sessionRepository: GameSessionStore
  screenshotRepository: ScreenshotRepository
  userRepository: GamePlayerStore
  inventoryRepository: InventoryRepository
  gameRepository: GameplayGameQuery
  funnelEventRepository: FunnelEventRepository
  positionSecondChanceRepository: PositionSecondChanceRepository
  positionLetterRevealRepository: PositionLetterRevealRepository
  onAfterGuessSubmitted?: (userId: string) => Promise<void>
  onAfterSessionCompleted?: (params: {
    userId: string
    sessionId: string
    challengeId: number
    finalScore: number
    screenshotsFound: number
    reason: 'all_found' | 'forfeit'
    isCatchUp: boolean
  }) => Promise<void>
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
  activateSecondChance(input: {
    tierSessionId: string
    position: number
    userId: string
  }): Promise<{ ok: true } | { ok: false; reason: 'ALREADY_ACTIVE' | 'NO_INVENTORY' | 'SESSION_NOT_FOUND' }>
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

  async function calculateAndUpdateStreak(
    userId: string,
    user: { currentStreak: number; longestStreak?: number; lastPlayedAt?: string } | null
  ): Promise<{ currentStreak: number; longestStreak: number }> {
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

  async function finalizeCompletedSession(params: {
    userId: string
    screenshotId: number
    tierSession: TierSessionWithContextRecord
    newTotalScore: number
    totalScreenshotsFound: number
    streakBonusTotal: number
    completionReason: 'all_found'
    screenshot: { gameId: number }
    gameName: string
    coverImageUrl: string | undefined
    releaseYear: number | undefined
    metacritic: number | undefined
  }): Promise<{ correctGame: Game; newlyEarnedAchievements: NewlyEarnedAchievement[] }> {
    const {
      userId,
      tierSession,
      newTotalScore,
      totalScreenshotsFound,
      streakBonusTotal,
      completionReason,
      screenshot,
      gameName,
      coverImageUrl,
      releaseYear,
      metacritic,
    } = params

    log.info(
      {
        userId,
        sessionId: tierSession.game_session_id,
        finalScore: newTotalScore,
        screenshotsFound: totalScreenshotsFound,
        completionReason,
      },
      'game completed'
    )

    void funnelEventRepository.record({
      eventName: 'session_completed',
      userId,
      sessionId: tierSession.game_session_id,
      payload: {
        finalScore: newTotalScore,
        screenshotsFound: totalScreenshotsFound,
        completionReason,
      },
    })

    if (deps.onAfterSessionCompleted) {
      void deps
        .onAfterSessionCompleted({
          userId,
          sessionId: tierSession.game_session_id,
          challengeId: tierSession.daily_challenge_id,
          finalScore: newTotalScore,
          screenshotsFound: totalScreenshotsFound,
          reason: 'all_found',
          isCatchUp: tierSession.is_catch_up,
        })
        .catch((error) => {
          log.warn(
            { userId, error: String(error) },
            'onAfterSessionCompleted hook failed (non-fatal)'
          )
        })
    }

    let newlyEarnedAchievements: NewlyEarnedAchievement[] = []
    try {
      const user = await userRepository.findById(userId)
      const updatedStreak = await calculateAndUpdateStreak(userId, user)

      log.info({ userId, scoreToAdd: newTotalScore }, 'Updating user total score')
      await userRepository.updateScore(userId, newTotalScore)

      const [allGuesses, gameGenres] = await Promise.all([
        sessionRepository.findAchievementGuessData(tierSession.game_session_id),
        gameRepository.getGenresById(screenshot.gameId),
      ])

      newlyEarnedAchievements = await achievementService.checkAchievementsAfterGame({
        userId,
        sessionId: tierSession.game_session_id,
        challengeId: tierSession.daily_challenge_id,
        totalScore: newTotalScore,
        streakBonusTotal,
        guesses: allGuesses,
        gameGenres,
        currentStreak: updatedStreak.currentStreak,
        longestStreak: updatedStreak.longestStreak,
      })
    } catch (error) {
      log.error({ error, userId }, 'Failed to check achievements')
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

    const fullGameData = await screenshotRepository.getGameByScreenshotId(params.screenshotId)
    if (fullGameData) {
      correctGame.publisher = fullGameData.publisher ?? undefined
      correctGame.developer = fullGameData.developer ?? undefined
    }

    return { correctGame, newlyEarnedAchievements }
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
        const tierSession = await sessionRepository.findLatestTierSession(session.id)
        if (tierSession) {
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
          sessionId: yesterdaySession?.id ?? null,
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

    const challenge = await challengeRepository.findById(challengeId)
    if (!challenge) {
      throw new GameError('CHALLENGE_NOT_FOUND', 'Challenge not found', 404)
    }

    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const allowedDays = isPremium ? PREMIUM_CATCH_UP_DAYS : CATCH_UP_DAYS
    const oldestAllowed = new Date(today)
    oldestAllowed.setDate(oldestAllowed.getDate() - allowedDays)

    const challengeDate = new Date(challenge.challenge_date)
    challengeDate.setHours(0, 0, 0, 0)

    const todayStr = new Date().toISOString().split('T')[0]
    const challengeDateStr = typeof challenge.challenge_date === 'string'
      ? challenge.challenge_date
      : challengeDate.toISOString().split('T')[0]

    const isCatchUp = challengeDateStr !== todayStr
    if (isCatchUp && challengeDate < oldestAllowed) {
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

      if (deps.onAfterSessionStarted) {
        void deps.onAfterSessionStarted({
          userId,
          sessionId: gameSession.id,
          challengeId,
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
      if (gameSession.is_completed) {
        throw new GameError('CHALLENGE_ALREADY_COMPLETED', 'You have already completed this challenge', 400)
      }
      log.debug({ sessionId: gameSession.id, challengeId, userId }, 'resuming existing session')
    }

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

    const tiers = await challengeRepository.findTiersByChallenge(session.daily_challenge_id)
    const tier = tiers[0]
    if (!tier) {
      throw new GameError('CHALLENGE_NOT_FOUND', 'Challenge not found', 404)
    }

    const tierScreenshot = await challengeRepository.findScreenshotAtPosition(tier.id, position)
    if (!tierScreenshot) {
      throw new GameError('SCREENSHOT_NOT_FOUND', 'Screenshot not found', 404)
    }

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

    const proxyImageUrl = `/api/game/image/${tierScreenshot.screenshot_id}`

    let letterReveal: LetterRevealState | undefined
    const screenshotWithGame = await screenshotRepository.findWithGame(
      tierScreenshot.screenshot_id
    )
    if (screenshotWithGame) {
      const revealRow = await positionLetterRevealRepository.find(latestTier.id, position)
      const maxLetters = effectiveMaxReveals(screenshotWithGame.gameName, (input, name) =>
        fuzzyMatchService.evaluateMatch(input, name, screenshotWithGame.aliases).matched
      )
      letterReveal = buildLetterRevealState(screenshotWithGame.gameName, maxLetters, revealRow)
    }

    return {
      screenshotId: tierScreenshot.screenshot_id,
      position: tierScreenshot.position,
      imageUrl: proxyImageUrl,
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
    return sessionRepository.withTierSessionLock(data.tierSessionId, async (): Promise<GuessResponse> => {
    log.debug({ tierSessionId: data.tierSessionId, position: data.position, userId: data.userId }, 'submitGuess')

    const tierSession = await sessionRepository.findTierSessionWithContext(data.tierSessionId)

    if (!tierSession || tierSession.user_id !== data.userId) {
      throw new GameError('SESSION_NOT_FOUND', 'Session not found', 404)
    }

    if (tierSession.game_is_completed) {
      throw new GameError('SESSION_ALREADY_COMPLETED', 'Session already completed', 409)
    }

    const guessTiers = await challengeRepository.findTiersByChallenge(tierSession.daily_challenge_id)
    const guessTier = guessTiers[0]
    const servedScreenshot = guessTier
      ? await challengeRepository.findScreenshotAtPosition(guessTier.id, data.position)
      : null
    if (!servedScreenshot || servedScreenshot.screenshot_id !== data.screenshotId) {
      throw new GameError(
        'SCREENSHOT_POSITION_MISMATCH',
        'Screenshot does not match this position',
        400
      )
    }

    if (await sessionRepository.hasCorrectGuessForPosition(data.tierSessionId, data.position)) {
      throw new GameError(
        'POSITION_ALREADY_SOLVED',
        'This screenshot has already been solved.',
        409
      )
    }

    const hadPriorWrongGuess = await sessionRepository.hasWrongGuessForPosition(
      data.tierSessionId,
      data.position
    )

    const screenshotData = await screenshotRepository.findWithGame(data.screenshotId)
    if (!screenshotData) {
      throw new GameError('SCREENSHOT_NOT_FOUND', 'Screenshot not found', 404)
    }

    const { screenshot, gameName, coverImageUrl, aliases, releaseYear, metacritic } = screenshotData

    const trimmedGuess = data.guessText.trim()
    const matchResult =
      trimmedGuess !== ''
        ? fuzzyMatchService.evaluateMatch(data.guessText, gameName, aliases)
        : null
    const precision = resolveMatchPrecision({
      trimmedGuess,
      matchResult,
      submittedGameId: data.gameId,
      answerGameId: screenshot.gameId,
    })
    const isCorrect = precision !== 'none'

    const timer = resolveRoundTimer({
      roundStartedAt: tierSession.round_started_at,
      stampedPosition: tierSession.round_position,
      submittedPosition: data.position,
      clientElapsedMs: data.roundTimeTakenMs,
      now: Date.now(),
    })

    if (!timer.valid) {
      throw new GameError(
        'ROUND_NOT_STARTED',
        'No active round timer for this position. Reload the screenshot and retry.',
        409
      )
    }

    const { serverElapsedMs, effectiveTimeTakenMs } = timer
    if (timer.diverged) {
      log.warn(
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

    let scoreEarned = 0
    let letterPenalty = 0
    let secondChanceFloorBoost: number | undefined
    let speedMultiplier: number | null = null
    let streak = 0
    let streakBonus = 0

    let pendingLetterRevealId: number | null = null
    let letterPenaltyPct = 0
    let pendingSecondChanceActivationId: number | null = null
    let secondChanceActive = false

    if (isCorrect) {
      const [letterReveal, activation] = await Promise.all([
        positionLetterRevealRepository.findPending(data.tierSessionId, data.position),
        positionSecondChanceRepository.findPending(data.tierSessionId, data.position),
      ])
      if (letterReveal) {
        pendingLetterRevealId = letterReveal.id
        letterPenaltyPct = letterReveal.penalty_pct
      }
      if (activation) {
        pendingSecondChanceActivationId = activation.id
        secondChanceActive = true
      }

      if (tierSession.streak_bonus_enabled) {
        const streakResult = calculateStreakBonus({
          position: data.position,
          firstTry: !hadPriorWrongGuess,
          firstTrySolvedPositions: await sessionRepository.getFirstTrySolvedPositions(
            data.tierSessionId
          ),
        })
        streak = streakResult.streak
        streakBonus = streakResult.streakBonus
      }

      const breakdown = calculateGuessScore({
        precision,
        effectiveTimeTakenMs,
        letterPenaltyPct,
        secondChanceActive,
        streakBonus,
      })
      scoreEarned = breakdown.scoreEarned
      letterPenalty = breakdown.letterPenalty
      secondChanceFloorBoost = breakdown.secondChanceFloorBoost
      speedMultiplier = breakdown.speedMultiplier

      if (letterPenalty > 0 && letterReveal) {
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
      if (secondChanceFloorBoost !== undefined) {
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

    let wrongGuessPenalty = 0
    if (!isCorrect) {
      wrongGuessPenalty = WRONG_GUESS_PENALTY
    }

    const newSessionScore = Math.max(0, tierSession.score + scoreEarned - wrongGuessPenalty)

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
        speedMultiplier,
        streak,
        streakBonus,
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
      sessionElapsedMs: effectiveTimeTakenMs,
      scoreEarned,
      powerUpUsed: null,
      hintFromInventory: false,
      letterPenalty,
      streakBonus,
    })

    if (pendingSecondChanceActivationId !== null) {
      await positionSecondChanceRepository.markApplied(
        pendingSecondChanceActivationId,
        null
      )
    }

    if (pendingLetterRevealId !== null) {
      await positionLetterRevealRepository.markApplied(pendingLetterRevealId, null)
    }

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
        powerUpUsed: null,
      },
    })

    await sessionRepository.updateTierSession(data.tierSessionId, {
      score: newSessionScore,
      correctAnswers: tierSession.correct_answers + (isCorrect ? 1 : 0),
      wrongGuesses: newWrongGuesses,
    })

    const totalScreenshotsFound = await sessionRepository.getCorrectAnswersCount(data.tierSessionId)

    const shouldAdvance = isCorrect

    let isCompleted = false
    let completionReason: 'all_found' | undefined

    if (totalScreenshotsFound >= TOTAL_SCREENSHOTS) {
      isCompleted = true
      completionReason = 'all_found'
    }

    const nextPosition = shouldAdvance
      ? (data.position < TOTAL_SCREENSHOTS ? data.position + 1 : null)
      : data.position

    const newTotalScore = Math.max(0, tierSession.game_total_score + scoreEarned - wrongGuessPenalty)
    const newStreakBonusTotal = (tierSession.game_streak_bonus_total ?? 0) + streakBonus
    await sessionRepository.updateGameSession(tierSession.game_session_id, {
      totalScore: newTotalScore,
      currentPosition: nextPosition ?? data.position,
      isCompleted,
      streakBonusTotal: streakBonus > 0 ? newStreakBonusTotal : undefined,
    })

    if (isCompleted) {
      const { correctGame, newlyEarnedAchievements } = await finalizeCompletedSession({
        userId: data.userId,
        screenshotId: data.screenshotId,
        tierSession,
        newTotalScore,
        totalScreenshotsFound,
        streakBonusTotal: newStreakBonusTotal,
        completionReason: 'all_found',
        screenshot,
        gameName,
        coverImageUrl,
        releaseYear,
        metacritic,
      })

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
        streakBonus: streakBonus > 0 ? streakBonus : undefined,
        streak: streak > 0 ? streak : undefined,
        matchPrecision: isCorrect ? (precision as 'exact' | 'partial') : undefined,
        newlyEarnedAchievements:
          newlyEarnedAchievements.length > 0 ? newlyEarnedAchievements : undefined,
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

    const fullGameData = await screenshotRepository.getGameByScreenshotId(data.screenshotId)

    if (fullGameData) {
      correctGame.publisher = fullGameData.publisher ?? undefined
      correctGame.developer = fullGameData.developer ?? undefined
    }

    let proximityHint: GuessResponse['proximityHint']
    if (!isCorrect && trimmedGuess !== '' && !hadPriorWrongGuess) {
      try {
        const candidates = await gameRepository.findGuessMatchCandidates(trimmedGuess)
        proximityHint =
          computeGuessProximityHint({
            guessText: trimmedGuess,
            answer: {
              id: screenshot.gameId,
              name: gameName,
              developer: correctGame.developer,
              publisher: correctGame.publisher,
            },
            candidates,
            fuzzyMatch: fuzzyMatchService,
          }) ?? undefined
      } catch (error) {
        log.warn(
          { userId: data.userId, error: String(error) },
          'proximity hint computation failed (non-fatal)'
        )
      }
    }

    return {
      isCorrect,
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
      streakBonus: streakBonus > 0 ? streakBonus : undefined,
      streak: streak > 0 ? streak : undefined,
      proximityHint,
      matchPrecision: isCorrect ? (precision as 'exact' | 'partial') : undefined,
    }
    })
  },

  async revealLetter(input: {
    tierSessionId: string
    position: number
    userId: string
    isPremium?: boolean
  }): Promise<RevealLetterResponse> {
    const { tierSessionId, position, userId, isPremium } = input
    return sessionRepository.withTierSessionLock(tierSessionId, async (): Promise<RevealLetterResponse> => {
      log.info({ tierSessionId, position, userId }, 'revealLetter')

      const tierSession = await sessionRepository.findTierSessionWithContext(tierSessionId)
      if (!tierSession || tierSession.user_id !== userId) {
        throw new GameError('SESSION_NOT_FOUND', 'Session not found', 404)
      }
      if (tierSession.game_is_completed) {
        throw new GameError('SESSION_ALREADY_COMPLETED', 'Session already completed', 409)
      }

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

      const maxLetters = effectiveMaxReveals(gameName, (input, name) =>
        fuzzyMatchService.evaluateMatch(input, name, aliases).matched
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

      if (!(await sessionRepository.hasWrongGuessForPosition(tierSessionId, position))) {
        throw new GameError(
          'LETTER_LOCKED',
          'Make at least one guess on this screenshot before revealing letters.',
          409
        )
      }

      const premiumFree = !!isPremium && !!tierSession.is_catch_up

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

    const ts = await sessionRepository.findTierSessionWithContext(tierSessionId)
    if (!ts || ts.user_id !== userId || ts.game_is_completed) {
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

    const session = await sessionRepository.findGameSessionById(sessionId, userId)
    if (!session) {
      throw new GameError('SESSION_NOT_FOUND', 'Session not found', 404)
    }

    if (session.is_completed) {
      throw new GameError('SESSION_ALREADY_COMPLETED', 'Session already completed', 400)
    }

    const guessCount = await sessionRepository.countGuessesBySession(sessionId)
    if (guessCount === 0) {
      throw new GameError(
        'SESSION_HAS_NO_PROGRESS',
        'Cannot forfeit a session without attempting any guess',
        400,
      )
    }

    const correctPositions = await sessionRepository.getCorrectPositions(sessionId)
    const screenshotsFound = correctPositions.length
    const unfoundCount = TOTAL_SCREENSHOTS - screenshotsFound

    const penaltyApplied = unfoundCount * UNFOUND_PENALTY

    const finalScore = session.total_score - penaltyApplied

    const unfoundGames: Array<{ position: number; game: Game; screenshot: Screenshot }> = []
    if (unfoundCount > 0) {
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

    const completed = await sessionRepository.completeGameSessionIfActive(sessionId, {
      totalScore: finalScore,
      currentPosition: session.current_position,
    })
    if (!completed) {
      throw new GameError('SESSION_ALREADY_COMPLETED', 'Session already completed', 400)
    }

    let newlyEarnedAchievements: NewlyEarnedAchievement[] = []
    try {
      const user = await userRepository.findById(userId)

      const updatedStreak = await calculateAndUpdateStreak(userId, user)

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
        streakBonusTotal: session.streak_bonus_total,
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
