import type { Game } from '@the-box/types'
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
  timeTakenMs: number
}

/**
 * Guess submission result from API
 */
export interface GuessSubmissionResult {
  isCorrect: boolean
  correctGame: Game
  scoreEarned: number
  totalScore: number
  nextPosition: number | null
  isCompleted: boolean
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

  async submitGuess(
    request: GuessSubmissionRequest
  ): Promise<GuessSubmissionResult> {
    // Simulate network delay
    await new Promise((resolve) => setTimeout(resolve, 300))

    const isCorrect = request.gameId === this.mockCorrectGame.id

    // Mock scoring: Base 100 + time bonus (up to 100)
    const baseScore = 100
    const timeBonus = Math.max(
      0,
      Math.min(100, 100 - Math.floor(request.timeTakenMs / 300))
    )
    const scoreEarned = isCorrect ? baseScore + timeBonus : 0

    // Mock total score
    const totalScore = scoreEarned

    // Mock next position
    const nextPosition =
      request.position < 10 ? request.position + 1 : null
    const isCompleted = request.position >= 10

    return {
      isCorrect,
      correctGame: this.mockCorrectGame,
      scoreEarned,
      totalScore,
      nextPosition,
      isCompleted,
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
