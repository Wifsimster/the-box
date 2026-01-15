import { sessionRepository, challengeRepository } from '../../infrastructure/repositories/index.js'
import type { GameHistoryResponse, GameSessionDetailsResponse, Game } from '@the-box/types'

const TOTAL_SCREENSHOTS = 10
const WRONG_GUESS_PENALTY = 30

export const userService = {
  async getGameHistory(userId: string): Promise<GameHistoryResponse> {
    const entries = await sessionRepository.findUserGameHistory(userId)

    return {
      entries: entries.map(entry => ({
        sessionId: entry.session_id,
        challengeDate: entry.challenge_date,
        totalScore: entry.total_score,
        isCompleted: entry.is_completed,
        completedAt: entry.completed_at?.toISOString() ?? null,
      })),
    }
  },

  async getGameSessionDetails(sessionId: string, userId: string): Promise<GameSessionDetailsResponse> {
    // Verify the session belongs to the user
    const gameSession = await sessionRepository.findGameSessionById(sessionId, userId)
    if (!gameSession) {
      throw new Error('Session not found')
    }

    // Get challenge date
    const challenge = await challengeRepository.findById(gameSession.daily_challenge_id)
    if (!challenge) {
      throw new Error('Challenge not found')
    }

    // Get all guesses for this session
    const guessesData = await sessionRepository.findGuessesByGameSession(sessionId)

    // Group guesses by position and find the correct one for each position
    const positionMap = new Map<number, typeof guessesData>()
    for (const guess of guessesData) {
      const existing = positionMap.get(guess.position) || []
      existing.push(guess)
      positionMap.set(guess.position, existing)
    }

    // Transform guesses to match GuessResult structure
    const guesses = Array.from(positionMap.entries())
      .sort(([a], [b]) => a - b)
      .map(([position, positionGuesses]) => {
        // Find the correct guess (if any)
        const correctGuess = positionGuesses.find(g => g.isCorrect)
        // Get the first guess (for userGuess display)
        const firstGuess = positionGuesses[0]!

        if (correctGuess) {
          // Calculate hint penalty (20% of score if hint was used)
          let hintPenalty: number | undefined
          if (correctGuess.powerUpUsed === 'hint_year' || correctGuess.powerUpUsed === 'hint_publisher') {
            // The score_earned already has hint penalty deducted, so we need to calculate original
            // Original score = scoreEarned / 0.8, hint penalty = original * 0.2
            const originalScore = Math.round(correctGuess.scoreEarned / 0.8)
            hintPenalty = Math.round(originalScore * 0.20)
          }

          const correctGame: Game = {
            id: correctGuess.correctGameId,
            name: correctGuess.correctGameName,
            slug: correctGuess.correctGameSlug,
            aliases: [],
            coverImageUrl: correctGuess.correctGameCoverImageUrl ?? undefined,
            releaseYear: correctGuess.correctGameReleaseYear ?? undefined,
            publisher: correctGuess.correctGamePublisher ?? undefined,
            developer: correctGuess.correctGameDeveloper ?? undefined,
            metacritic: correctGuess.correctGameMetacritic ?? undefined,
          }

          return {
            position,
            isCorrect: true,
            correctGame,
            userGuess: firstGuess.guessedText || null,
            timeTakenMs: correctGuess.timeTakenMs,
            scoreEarned: correctGuess.scoreEarned,
            hintPenalty,
            tryNumber: correctGuess.tryNumber,
          }
        } else {
          // No correct guess - use the last guess for display
          const lastGuess = positionGuesses[positionGuesses.length - 1]!
          
          // Get correct game info from the screenshot
          const anyGuess = positionGuesses[0]!
          const correctGame: Game = {
            id: anyGuess.correctGameId,
            name: anyGuess.correctGameName,
            slug: anyGuess.correctGameSlug,
            aliases: [],
            coverImageUrl: anyGuess.correctGameCoverImageUrl ?? undefined,
            releaseYear: anyGuess.correctGameReleaseYear ?? undefined,
            publisher: anyGuess.correctGamePublisher ?? undefined,
            developer: anyGuess.correctGameDeveloper ?? undefined,
            metacritic: anyGuess.correctGameMetacritic ?? undefined,
          }

          return {
            position,
            isCorrect: false,
            correctGame,
            userGuess: lastGuess.guessedText || null,
            timeTakenMs: lastGuess.timeTakenMs,
            scoreEarned: 0,
            wrongGuessPenalty: WRONG_GUESS_PENALTY,
            tryNumber: lastGuess.tryNumber,
          }
        }
      })

    return {
      sessionId: gameSession.id,
      challengeDate: challenge.challenge_date,
      totalScore: gameSession.total_score,
      isCompleted: gameSession.is_completed,
      completedAt: gameSession.completed_at?.toISOString() ?? null,
      totalScreenshots: TOTAL_SCREENSHOTS,
      guesses,
    }
  },
}
