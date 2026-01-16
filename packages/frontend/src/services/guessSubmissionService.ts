import type { Game, NewlyEarnedAchievement } from '@the-box/types'
import {
  fetchWithRetry,
  parseApiError,
  logError,
  AuthenticationError,
  NotFoundError,
} from '@/lib/errors'

/**
 * Guess submission request
 */
export interface GuessSubmissionRequest {
  tierSessionId: string
  screenshotId: number
  position: number
  gameId: number | null
  guessText: string
  roundTimeTakenMs: number
  powerUpUsed?: 'hint_year' | 'hint_publisher'
}

/**
 * Guess submission result from API
 */
export interface GuessSubmissionResult {
  isCorrect: boolean
  correctGame: Game
  scoreEarned: number
  totalScore: number
  screenshotsFound: number
  nextPosition: number | null
  isCompleted: boolean
  completionReason?: 'all_found' | 'forfeit'
  hintPenalty?: number
  wrongGuessPenalty?: number
  availableHints?: {
    year: string | null
    publisher: string | null
  }
  newlyEarnedAchievements?: NewlyEarnedAchievement[]
}

/**
 * Service interface for guess submission
 */
export interface GuessSubmissionService {
  submitGuess(request: GuessSubmissionRequest): Promise<GuessSubmissionResult>
}

/**
 * Mock guess submission service for development
 */
export class MockGuessSubmissionService implements GuessSubmissionService {
  private mockCorrectGame: Game = {
    id: 1,
    name: 'The Witcher 3: Wild Hunt',
    slug: 'witcher-3',
    aliases: ['Witcher 3', 'TW3'],
    releaseYear: 2015,
  }

  private correctAnswers = 0
  private totalLockedScore = 0
  private readonly WRONG_GUESS_PENALTY = 30

  async submitGuess(
    request: GuessSubmissionRequest
  ): Promise<GuessSubmissionResult> {
    // Simulate network delay
    await new Promise((resolve) => setTimeout(resolve, 300))

    const isCorrect = request.gameId === this.mockCorrectGame.id

    // Score is "locked in" only on correct guess
    // Wrong guesses deduct 100 points from total score (clamped at 0)
    const scoreEarned = isCorrect ? 100 : 0
    const scorePenalty = isCorrect ? 0 : this.WRONG_GUESS_PENALTY

    if (isCorrect) {
      this.correctAnswers++
    }

    // Apply penalty for wrong guess, add earned score for correct
    this.totalLockedScore = Math.max(0, this.totalLockedScore - scorePenalty) + scoreEarned

    // Advance only on correct guess
    const shouldAdvance = isCorrect

    // Determine next position and completion
    const nextPosition = shouldAdvance
      ? (request.position < 10 ? request.position + 1 : null)
      : request.position

    const isCompleted = this.correctAnswers >= 10 ||
      (shouldAdvance && request.position >= 10)

    let completionReason: 'all_found' | undefined
    if (isCompleted) {
      completionReason = 'all_found'
    }

    return {
      isCorrect,
      correctGame: this.mockCorrectGame,
      scoreEarned,
      totalScore: this.totalLockedScore,
      screenshotsFound: this.correctAnswers,
      nextPosition,
      isCompleted,
      completionReason,
    }
  }
}

/**
 * API-based guess submission service
 * Uses backend endpoint: POST /api/game/guess
 */
export class ApiGuessSubmissionService implements GuessSubmissionService {
  private readonly baseUrl: string

  constructor(baseUrl = '/api') {
    this.baseUrl = baseUrl
  }

  async submitGuess(
    request: GuessSubmissionRequest
  ): Promise<GuessSubmissionResult> {
    try {
      // Use fetchWithRetry for guess submission
      // Only retry on network errors and 5xx, not on client errors
      const response = await fetchWithRetry(
        `${this.baseUrl}/game/guess`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(request),
        },
        {
          maxRetries: 2,
          delayMs: 1000,
          // Only retry on server errors, not client errors
          retryableStatuses: [500, 502, 503, 504],
        }
      )

      if (!response.ok) {
        // Parse and throw appropriate error type
        throw await parseApiError(response)
      }

      const data = await response.json()

      if (!data.success) {
        throw new Error(data.error?.message || 'Guess submission failed')
      }

      return data.data
    } catch (error) {
      // Log error with context
      logError(error, 'GuessSubmissionService')

      // Re-throw for upstream handling
      throw error
    }
  }
}

/**
 * Factory function to create the guess submission service
 * Uses API service by default, falls back to mock if VITE_USE_MOCK_API is true
 */
export function createGuessSubmissionService(): GuessSubmissionService {
  const useMock = import.meta.env.VITE_USE_MOCK_API === 'true'

  if (useMock) {
    console.log('[GuessSubmission] Using mock service')
    return new MockGuessSubmissionService()
  }

  return new ApiGuessSubmissionService()
}
