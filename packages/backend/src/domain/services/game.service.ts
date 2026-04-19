import type {
  TodayChallengeResponse,
  StartChallengeResponse,
  ScreenshotResponse,
  GuessResponse,
  EndGameResponse,
  Game,
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
} from '../ports/repositories.js'
import type { FuzzyMatchService } from './fuzzy-match.service.js'
import type { AchievementService } from './achievement.service.js'

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
const CATCH_UP_DAYS = 7

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
}

export interface GameService {
  getTodayChallenge(userId?: string, date?: string): Promise<TodayChallengeResponse>
  startChallenge(challengeId: number, userId: string): Promise<StartChallengeResponse>
  getScreenshot(sessionId: string, position: number, userId: string): Promise<ScreenshotResponse>
  submitGuess(data: {
    tierSessionId: string
    screenshotId: number
    position: number
    gameId: number | null
    guessText: string
    roundTimeTakenMs: number
    userId: string
    powerUpUsed?: 'hint_year' | 'hint_publisher'
  }): Promise<GuessResponse>
  endGame(sessionId: string, userId: string): Promise<EndGameResponse>
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
  } = deps
  const log = deps.logger.child({ service: 'game' })

  async function calculateAndUpdateStreak(
    userId: string,
    user: { currentStreak: number; longestStreak?: number; lastPlayedAt?: string } | null
  ): Promise<{ currentStreak: number; longestStreak: number }> {
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    let currentStreak = user?.currentStreak || 0
    let longestStreak = user?.longestStreak || 0
    const lastPlayedAtStr = user?.lastPlayedAt

    if (!lastPlayedAtStr) {
      currentStreak = 1
      longestStreak = Math.max(1, longestStreak)
      log.info({ userId, currentStreak, longestStreak }, 'First game - streak started')
    } else {
      const lastPlayed = new Date(lastPlayedAtStr)
      lastPlayed.setHours(0, 0, 0, 0)

      const daysDiff = Math.floor((today.getTime() - lastPlayed.getTime()) / (1000 * 60 * 60 * 24))

      if (daysDiff === 0) {
        log.debug({ userId, currentStreak }, 'Same day play - streak unchanged')
      } else if (daysDiff === 1) {
        currentStreak += 1
        longestStreak = Math.max(currentStreak, longestStreak)
        log.info({ userId, currentStreak, longestStreak }, 'Streak continued')
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

  async startChallenge(challengeId: number, userId: string): Promise<StartChallengeResponse> {
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

    // Calculate the oldest allowed date (CATCH_UP_DAYS days ago)
    const oldestAllowed = new Date(today)
    oldestAllowed.setDate(oldestAllowed.getDate() - CATCH_UP_DAYS)

    const challengeDate = new Date(challenge.challenge_date)
    challengeDate.setHours(0, 0, 0, 0)

    const todayStr = today.toISOString().split('T')[0]
    const challengeDateStr = typeof challenge.challenge_date === 'string'
      ? challenge.challenge_date
      : challengeDate.toISOString().split('T')[0]

    // Check if challenge is from the past (not today and older than CATCH_UP_DAYS)
    const isCatchUp = challengeDateStr !== todayStr
    if (isCatchUp && challengeDate < oldestAllowed) {
      throw new GameError('CHALLENGE_TOO_OLD', `This challenge is no longer available. You can only play challenges from the last ${CATCH_UP_DAYS} days.`, 400)
    }

    let gameSession = await sessionRepository.findGameSession(userId, challengeId)

    if (!gameSession) {
      gameSession = await sessionRepository.createGameSession({
        userId,
        dailyChallengeId: challengeId,
        isCatchUp,
      })
      log.info({ sessionId: gameSession.id, challengeId, userId, isCatchUp }, 'new game session started')
    } else {
      // Check if session is already completed
      if (gameSession.is_completed) {
        throw new GameError('CHALLENGE_ALREADY_COMPLETED', 'You have already completed this challenge', 400)
      }
      log.debug({ sessionId: gameSession.id, challengeId, userId }, 'resuming existing session')
    }

    const tierSession = await sessionRepository.createTierSession({
      gameSessionId: gameSession.id,
      tierId: tier.id,
    })

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
    userId: string
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

    // Use proxy URL to hide the actual file path (which contains game slug)
    const proxyImageUrl = `/api/game/image/${tierScreenshot.screenshot_id}`

    return {
      screenshotId: tierScreenshot.screenshot_id,
      position: tierScreenshot.position,
      imageUrl: proxyImageUrl,
      bonusMultiplier: parseFloat(tierScreenshot.bonus_multiplier),
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
    powerUpUsed?: 'hint_year' | 'hint_publisher'
  }): Promise<GuessResponse> {
    log.debug({ tierSessionId: data.tierSessionId, position: data.position, userId: data.userId }, 'submitGuess')

    const tierSession = await sessionRepository.findTierSessionWithContext(data.tierSessionId)

    if (!tierSession || tierSession.user_id !== data.userId) {
      throw new GameError('SESSION_NOT_FOUND', 'Session not found', 404)
    }

    const screenshotData = await screenshotRepository.findWithGame(data.screenshotId)
    if (!screenshotData) {
      throw new GameError('SCREENSHOT_NOT_FOUND', 'Screenshot not found', 404)
    }

    const { screenshot, gameName, coverImageUrl, aliases, releaseYear, metacritic } = screenshotData

    // Check if guess is correct using fuzzy matching on text
    const isCorrect = data.gameId === screenshot.gameId ||
      (data.guessText.trim() !== '' && fuzzyMatchService.isMatch(data.guessText, gameName, aliases))

    // Calculate score based on speed multiplier (only for correct guesses)
    // Base score is 100 points, multiplied by speed factor
    let scoreEarned = 0
    let hintPenalty = 0
    let hintFromInventory = false
    if (isCorrect) {
      const speedMultiplier = calculateSpeedMultiplier(data.roundTimeTakenMs)
      scoreEarned = Math.round(BASE_SCORE * speedMultiplier)
      // Cap max score per screenshot at 200 points
      scoreEarned = Math.min(scoreEarned, 200)

      // Check if hint was used and handle penalty/inventory
      if (data.powerUpUsed === 'hint_year' || data.powerUpUsed === 'hint_publisher' || data.powerUpUsed === 'hint_developer') {
        // Check if user has hint in inventory (use it for free)
        const hasHintInInventory = await inventoryRepository.useItems(
          data.userId,
          'powerup',
          data.powerUpUsed,
          1
        )

        if (hasHintInInventory) {
          // Hint from inventory - no penalty
          hintFromInventory = true
          log.info({ userId: data.userId, hintType: data.powerUpUsed }, 'hint used from inventory (no penalty)')
        } else {
          // No inventory - apply 20% penalty
          hintPenalty = Math.round(scoreEarned * 0.20)
          scoreEarned -= hintPenalty
          log.info({ userId: data.userId, hintType: data.powerUpUsed, penalty: hintPenalty }, 'hint used with penalty (no inventory)')
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
        roundTimeTakenMs: data.roundTimeTakenMs,
        speedMultiplier: isCorrect ? calculateSpeedMultiplier(data.roundTimeTakenMs) : null,
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
      sessionElapsedMs: data.roundTimeTakenMs, // Store round time as sessionElapsedMs for backward compatibility
      scoreEarned,
    })

    await sessionRepository.updateTierSession(data.tierSessionId, {
      score: newSessionScore,
      correctAnswers: tierSession.correct_answers + (isCorrect ? 1 : 0),
      wrongGuesses: newWrongGuesses,
    })

    // Get count of screenshots found (correct answers)
    const screenshotsFound = await sessionRepository.getCorrectAnswersCount(data.tierSessionId)
    const totalScreenshotsFound = screenshotsFound + (isCorrect ? 1 : 0)

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
        hintPenalty: hintPenalty > 0 ? hintPenalty : undefined,
        hintFromInventory: hintFromInventory || undefined,
        wrongGuessPenalty: wrongGuessPenalty > 0 ? wrongGuessPenalty : undefined,
        availableHints: {
          year: releaseYear?.toString() ?? null,
          publisher: fullGameData?.publisher ?? null,
          developer: fullGameData?.developer ?? null,
        },
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
      correctGame,
      scoreEarned,
      totalScore: newTotalScore,
      screenshotsFound: totalScreenshotsFound,
      nextPosition,
      isCompleted,
      completionReason,
      hintPenalty: hintPenalty > 0 ? hintPenalty : undefined,
      hintFromInventory: hintFromInventory || undefined,
      wrongGuessPenalty: wrongGuessPenalty > 0 ? wrongGuessPenalty : undefined,
      availableHints: {
        year: releaseYear?.toString() ?? null,
        publisher: fullGameData?.publisher ?? null,
        developer: fullGameData?.developer ?? null,
      },
    }
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

      await achievementService.checkAchievementsAfterGame({
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

    return {
      totalScore: finalScore,
      screenshotsFound,
      unfoundCount,
      penaltyApplied,
      isCompleted: true,
      completionReason: 'forfeit',
      unfoundGames,
    }
  },
  }
}
