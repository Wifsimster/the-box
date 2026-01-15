import {
  challengeRepository,
  sessionRepository,
  screenshotRepository,
} from '../../infrastructure/repositories/index.js'
import { db } from '../../infrastructure/database/connection.js'
import type {
  TodayChallengeResponse,
  StartChallengeResponse,
  ScreenshotResponse,
  GuessResponse,
  EndGameResponse,
  Game,
  Screenshot,
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
const BASE_SCORE = 100
const UNFOUND_PENALTY = 50
const WRONG_GUESS_PENALTY = 30

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
    if (isCorrect) {
      const speedMultiplier = calculateSpeedMultiplier(data.roundTimeTakenMs)
      scoreEarned = Math.round(BASE_SCORE * speedMultiplier)
      // Cap max score per screenshot at 200 points
      scoreEarned = Math.min(scoreEarned, 200)

      // Calculate hint penalty as 20% of earned score (after speed multiplier)
      if (data.powerUpUsed === 'hint_year' || data.powerUpUsed === 'hint_publisher') {
        hintPenalty = Math.round(scoreEarned * 0.20)
        scoreEarned -= hintPenalty
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
      wrongGuessPenalty: wrongGuessPenalty > 0 ? wrongGuessPenalty : undefined,
      availableHints: {
        year: releaseYear?.toString() ?? null,
        publisher: fullGameData?.publisher ?? null,
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
        // Get all tier screenshots with game info
        const allTierScreenshots = await db('tier_screenshots')
          .join('screenshots', 'tier_screenshots.screenshot_id', 'screenshots.id')
          .join('games', 'screenshots.game_id', 'games.id')
          .where('tier_screenshots.tier_id', tier.id)
          .whereNotIn('tier_screenshots.position', correctPositions.length > 0 ? correctPositions : [0])
          .select(
            'tier_screenshots.position',
            'screenshots.id as screenshot_id',
            'screenshots.image_url',
            'screenshots.thumbnail_url',
            'screenshots.difficulty',
            'screenshots.location_hint',
            'screenshots.game_id',
            'games.id as game_id',
            'games.name as game_name',
            'games.slug as game_slug',
            'games.cover_image_url',
            'games.release_year',
            'games.developer',
            'games.publisher',
            'games.metacritic'
          )
          .orderBy('tier_screenshots.position', 'asc')

        for (const row of allTierScreenshots) {
          unfoundGames.push({
            position: row.position,
            game: {
              id: row.game_id,
              name: row.game_name,
              slug: row.game_slug,
              aliases: [],
              coverImageUrl: row.cover_image_url ?? undefined,
              releaseYear: row.release_year ?? undefined,
              developer: row.developer ?? undefined,
              publisher: row.publisher ?? undefined,
              metacritic: row.metacritic ?? undefined,
            },
            screenshot: {
              id: row.screenshot_id,
              gameId: row.game_id,
              imageUrl: row.image_url,
              thumbnailUrl: row.thumbnail_url ?? undefined,
              difficulty: row.difficulty,
              locationHint: row.location_hint ?? undefined,
            },
          })
        }
      }
    }

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
      unfoundGames,
    }
  },
}
