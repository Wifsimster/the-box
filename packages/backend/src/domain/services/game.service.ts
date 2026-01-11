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
  Game,
} from '@the-box/types'
import { serviceLogger } from '../../infrastructure/logger/logger.js'

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
const TIME_LIMIT_SECONDS = 30

export const gameService = {
  async getTodayChallenge(userId?: string): Promise<TodayChallengeResponse> {
    const today = new Date().toISOString().split('T')[0]!
    log.debug({ date: today, userId }, 'getTodayChallenge')

    const challenge = await challengeRepository.findByDate(today)

    if (!challenge) {
      log.debug({ date: today }, 'no challenge found for today')
      return {
        challengeId: null,
        date: today,
        totalScreenshots: TOTAL_SCREENSHOTS,
        timeLimit: TIME_LIMIT_SECONDS,
        hasPlayed: false,
        userSession: null,
      }
    }

    let userSession = null
    if (userId) {
      const session = await sessionRepository.findGameSession(userId, challenge.id)
      if (session) {
        userSession = {
          sessionId: session.id,
          currentPosition: session.current_position,
          isCompleted: session.is_completed,
          totalScore: session.total_score,
        }
        log.debug({ userId, challengeId: challenge.id, hasPlayed: true }, 'user has existing session')
      }
    }

    return {
      challengeId: challenge.id,
      date: challenge.challenge_date,
      totalScreenshots: TOTAL_SCREENSHOTS,
      timeLimit: TIME_LIMIT_SECONDS,
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
      timeLimit: TIME_LIMIT_SECONDS,
      totalScreenshots: TOTAL_SCREENSHOTS,
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

    return {
      screenshotId: tierScreenshot.screenshot_id,
      position: tierScreenshot.position,
      imageUrl: tierScreenshot.image_url,
      timeLimit: TIME_LIMIT_SECONDS,
      bonusMultiplier: parseFloat(tierScreenshot.bonus_multiplier),
    }
  },

  async submitGuess(data: {
    tierSessionId: string
    screenshotId: number
    position: number
    gameId: number | null
    guessText: string
    timeTakenMs: number
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

    const { screenshot, gameName, coverImageUrl } = screenshotData

    const isCorrect = data.gameId === screenshot.gameId

    const scoreEarned = this.calculateScore(
      isCorrect,
      data.timeTakenMs,
      TIME_LIMIT_SECONDS
    )

    log.info(
      {
        userId: data.userId,
        position: data.position,
        isCorrect,
        scoreEarned,
        timeTakenMs: data.timeTakenMs,
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
      timeTakenMs: data.timeTakenMs,
      scoreEarned,
    })

    await sessionRepository.updateTierSession(data.tierSessionId, {
      score: tierSession.score + scoreEarned,
      correctAnswers: tierSession.correct_answers + (isCorrect ? 1 : 0),
    })

    const newTotalScore = tierSession.game_total_score + scoreEarned
    const isCompleted = data.position >= TOTAL_SCREENSHOTS

    await sessionRepository.updateGameSession(tierSession.game_session_id, {
      totalScore: newTotalScore,
      currentPosition: isCompleted ? data.position : data.position + 1,
      isCompleted,
    })

    if (isCompleted) {
      log.info(
        { userId: data.userId, sessionId: tierSession.game_session_id, finalScore: newTotalScore },
        'game completed'
      )
    }

    const correctGame: Game = {
      id: screenshot.gameId,
      name: gameName,
      slug: '',
      aliases: [],
      coverImageUrl,
    }

    return {
      isCorrect,
      correctGame,
      scoreEarned,
      totalScore: newTotalScore,
      nextPosition: isCompleted ? null : data.position + 1,
      isCompleted,
    }
  },

  calculateScore(isCorrect: boolean, timeTakenMs: number, timeLimitSeconds: number): number {
    if (!isCorrect) return 0

    const baseScore = 100
    const timeRatio = timeTakenMs / (timeLimitSeconds * 1000)

    let timeBonus = 0
    if (timeRatio < 0.25) {
      timeBonus = 100
    } else if (timeRatio < 0.75) {
      timeBonus = Math.round(100 * (1 - (timeRatio - 0.25) / 0.5))
    }

    return baseScore + timeBonus
  },
}
