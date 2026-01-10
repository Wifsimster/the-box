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
const TIME_LIMIT_SECONDS = 30

export const gameService = {
  async getTodayChallenge(userId?: string): Promise<TodayChallengeResponse> {
    const today = new Date().toISOString().split('T')[0]!

    const challenge = await challengeRepository.findByDate(today)

    if (!challenge) {
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
    // Find the single tier for this challenge
    const tiers = await challengeRepository.findTiersByChallenge(challengeId)
    const tier = tiers[0]
    if (!tier) {
      throw new GameError('CHALLENGE_NOT_FOUND', 'Challenge not found', 404)
    }

    // Get or create game session
    let gameSession = await sessionRepository.findGameSession(userId, challengeId)

    if (!gameSession) {
      gameSession = await sessionRepository.createGameSession({
        userId,
        dailyChallengeId: challengeId,
      })
    }

    // Create tier session (we still use tier_sessions internally)
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
      position: tierScreenshot.position,
      imageUrl: tierScreenshot.image_url,
      haov: tierScreenshot.haov,
      vaov: tierScreenshot.vaov,
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
    const tierSession = await sessionRepository.findTierSessionWithContext(data.tierSessionId)

    if (!tierSession || tierSession.user_id !== data.userId) {
      throw new GameError('SESSION_NOT_FOUND', 'Session not found', 404)
    }

    // Get screenshot with game info
    const screenshotData = await screenshotRepository.findWithGame(data.screenshotId)
    if (!screenshotData) {
      throw new GameError('SCREENSHOT_NOT_FOUND', 'Screenshot not found', 404)
    }

    const { screenshot, gameName, coverImageUrl } = screenshotData

    // Check if correct
    const isCorrect = data.gameId === screenshot.gameId

    // Calculate score
    const scoreEarned = this.calculateScore(
      isCorrect,
      data.timeTakenMs,
      TIME_LIMIT_SECONDS
    )

    // Save guess
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

    // Update tier session
    await sessionRepository.updateTierSession(data.tierSessionId, {
      score: tierSession.score + scoreEarned,
      correctAnswers: tierSession.correct_answers + (isCorrect ? 1 : 0),
    })

    // Update game session
    const newTotalScore = tierSession.game_total_score + scoreEarned
    const isCompleted = data.position >= TOTAL_SCREENSHOTS

    await sessionRepository.updateGameSession(tierSession.game_session_id, {
      totalScore: newTotalScore,
      currentPosition: isCompleted ? data.position : data.position + 1,
      isCompleted,
    })

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
