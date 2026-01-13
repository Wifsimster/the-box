import {
  challengeRepository,
  sessionRepository,
  screenshotRepository,
} from '../../infrastructure/repositories/index.js'
import type {
  TodayChallengeResponse,
  StartChallengeResponse,
  ScreenshotResponse,
  GuessResponse,
  EndGameResponse,
  Game,
} from '@the-box/types'
import { serviceLogger } from '../../infrastructure/logger/logger.js'
import { fuzzyMatchService } from './fuzzy-match.service.js'

const log = serviceLogger.child({ service: 'game' })

export class GameError extends Error {
  constructor(
    public code: string,
    message: string,
    public statusCode: number = 400
  ) {
    super(message)
    this.name = 'GameError'
    log.warn({ code, statusCode }, message)
  }
}

const TOTAL_SCREENSHOTS = 10
const BASE_SCORE = 50
const UNFOUND_PENALTY = 50

/**
 * Calculate speed multiplier based on time taken to find the screenshot
 * @param timeTakenMs Time in milliseconds from screenshot shown to correct guess
 * @returns Multiplier value (1.0 to 2.0)
 */
function calculateSpeedMultiplier(timeTakenMs: number): number {
  const timeTakenSeconds = timeTakenMs / 1000
  
  if (timeTakenSeconds < 5) {
    return 2.0 // 100 points
  } else if (timeTakenSeconds < 15) {
    return 1.5 // 75 points
  } else if (timeTakenSeconds < 30) {
    return 1.2 // 60 points
  } else {
    return 1.0 // 50 points
  }
}

export const gameService = {
  async getTodayChallenge(userId?: string, date?: string): Promise<TodayChallengeResponse> {
    const targetDate = date || new Date().toISOString().split('T')[0]!
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
            scoringConfig: {
              initialScore: session.initial_score,
              decayRate: session.decay_rate,
            },
          }
          log.debug({ userId, challengeId: challenge.id, tierSessionId: tierSession.id, hasPlayed: true, correctPositions }, 'user has existing session')
        }
      }
    }

    return {
      challengeId: challenge.id,
      date: challenge.challenge_date,
      totalScreenshots: TOTAL_SCREENSHOTS,
      hasPlayed: !!userSession,
      userSession,
    }
  },

  async startChallenge(challengeId: number, userId: string): Promise<StartChallengeResponse> {
    log.info({ challengeId, userId }, 'startChallenge')

    const tiers = await challengeRepository.findTiersByChallenge(challengeId)
    const tier = tiers[0]
    if (!tier) {
      throw new GameError('CHALLENGE_NOT_FOUND', 'Challenge not found', 404)
    }

    let gameSession = await sessionRepository.findGameSession(userId, challengeId)

    if (!gameSession) {
      gameSession = await sessionRepository.createGameSession({
        userId,
        dailyChallengeId: challengeId,
      })
      log.info({ sessionId: gameSession.id, challengeId, userId }, 'new game session started')
    } else {
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
      scoringConfig: {
        initialScore: gameSession.initial_score,
        decayRate: gameSession.decay_rate,
      },
    }
  },

  async getScreenshot(
    sessionId: string,
    position: number,
    userId: string,
    isAdmin: boolean = false
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

    const response: ScreenshotResponse = {
      screenshotId: tierScreenshot.screenshot_id,
      position: tierScreenshot.position,
      imageUrl: tierScreenshot.image_url,
      bonusMultiplier: parseFloat(tierScreenshot.bonus_multiplier),
    }

    // Include game name hint for admin users
    if (isAdmin) {
      const screenshotData = await screenshotRepository.findWithGame(tierScreenshot.screenshot_id)
      if (screenshotData) {
        response.gameName = screenshotData.gameName
      }
    }

    return response
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
    // Base score is 50 points, multiplied by speed factor
    // Wrong guesses don't affect score (unlimited tries)
    let scoreEarned = 0
    if (isCorrect) {
      const speedMultiplier = calculateSpeedMultiplier(data.roundTimeTakenMs)
      scoreEarned = Math.round(BASE_SCORE * speedMultiplier)
    }
    
    // No penalty for wrong guesses - unlimited tries
    const newSessionScore = tierSession.score + scoreEarned

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
    } else if (shouldAdvance && data.position >= TOTAL_SCREENSHOTS) {
      // Last position and correct
      isCompleted = true
      if (totalScreenshotsFound >= TOTAL_SCREENSHOTS) {
        completionReason = 'all_found'
      }
    }

    // Calculate next position
    const nextPosition = shouldAdvance
      ? (data.position < TOTAL_SCREENSHOTS ? data.position + 1 : null)
      : data.position // Stay on same position if tries remaining

    // Update game session with locked-in score
    const newTotalScore = tierSession.game_total_score + scoreEarned
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

    return {
      isCorrect,
      correctGame,
      scoreEarned,
      totalScore: newTotalScore,
      screenshotsFound: totalScreenshotsFound,
      nextPosition,
      isCompleted,
      completionReason,
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

    // Calculate final score (clamp at 0)
    const finalScore = Math.max(0, session.total_score - penaltyApplied)

    // Mark session as completed
    await sessionRepository.updateGameSession(sessionId, {
      totalScore: finalScore,
      currentPosition: session.current_position,
      isCompleted: true,
    })

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
    }
  },
}
