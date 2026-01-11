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
// Default scoring config (actual values come from database)
// INITIAL_SCORE = 1000, DECAY_RATE = 2 pts/sec
const WRONG_GUESS_PENALTY = 100

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
          userSession = {
            sessionId: session.id,
            tierSessionId: tierSession.id,
            currentPosition: session.current_position,
            isCompleted: session.is_completed,
            totalScore: session.total_score,
          }
          log.debug({ userId, challengeId: challenge.id, tierSessionId: tierSession.id, hasPlayed: true }, 'user has existing session')
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
    sessionElapsedMs: number
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

    const { screenshot, gameName, coverImageUrl, aliases } = screenshotData

    // Check if guess is correct using fuzzy matching on text
    const isCorrect = data.gameId === screenshot.gameId ||
      (data.guessText.trim() !== '' && fuzzyMatchService.isMatch(data.guessText, gameName, aliases))

    // Calculate current countdown score
    const currentScore = this.calculateCurrentScore(
      tierSession.game_session_started_at,
      tierSession.initial_score,
      tierSession.decay_rate
    )

    // Score earned is awarded on correct guess - it "locks in" the current countdown value
    // Wrong guesses deduct 100 points from the total score (clamped at 0)
    const scoreEarned = isCorrect ? currentScore : 0
    const scorePenalty = isCorrect ? 0 : WRONG_GUESS_PENALTY
    const newSessionScore = Math.max(0, tierSession.score - scorePenalty)

    log.info(
      {
        userId: data.userId,
        position: data.position,
        isCorrect,
        scoreEarned,
        scorePenalty,
        currentScore,
        sessionElapsedMs: data.sessionElapsedMs,
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
      sessionElapsedMs: data.sessionElapsedMs,
      scoreEarned,
    })

    await sessionRepository.updateTierSession(data.tierSessionId, {
      score: newSessionScore + scoreEarned,
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

  calculateCurrentScore(sessionStartedAt: Date, initialScore: number, decayRate: number): number {
    const elapsedMs = Date.now() - sessionStartedAt.getTime()
    const elapsedSeconds = Math.floor(elapsedMs / 1000)
    return Math.max(0, initialScore - (elapsedSeconds * decayRate))
  },
}
