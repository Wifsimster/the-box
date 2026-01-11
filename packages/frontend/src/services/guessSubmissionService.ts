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
  sessionElapsedMs: number
}

/**
 * Guess submission result from API
 */
export interface GuessSubmissionResult {
  isCorrect: boolean
  correctGame: Game
  scoreEarned: number
  totalScore: number
  triesRemaining: number
  screenshotsFound: number
  nextPosition: number | null
  isCompleted: boolean
  completionReason?: 'all_found' | 'all_tries_exhausted'
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

  private triesPerPosition: Map<number, number> = new Map()
  private correctAnswers = 0
  private totalLockedScore = 0
  private sessionStartTime = Date.now()
  private initialScore = 1000
  private decayRate = 2

  async submitGuess(
    request: GuessSubmissionRequest
  ): Promise<GuessSubmissionResult> {
    // Simulate network delay
    await new Promise((resolve) => setTimeout(resolve, 300))

    const isCorrect = request.gameId === this.mockCorrectGame.id

    // Get current tries for this position
    const currentTries = this.triesPerPosition.get(request.position) ?? 0
    const tryNumber = currentTries + 1
    this.triesPerPosition.set(request.position, tryNumber)

    // Calculate countdown score based on elapsed time
    const elapsedSeconds = Math.floor(request.sessionElapsedMs / 1000)
    const currentScore = Math.max(0, this.initialScore - (elapsedSeconds * this.decayRate))

    // Score is "locked in" only on correct guess
    const scoreEarned = isCorrect ? currentScore : 0

    if (isCorrect) {
      this.correctAnswers++
      this.totalLockedScore += scoreEarned
    }

    const triesRemaining = isCorrect ? 3 : Math.max(0, 3 - tryNumber)
    const shouldAdvance = isCorrect || triesRemaining === 0

    // Determine next position and completion
    const nextPosition = shouldAdvance
      ? (request.position < 10 ? request.position + 1 : null)
      : request.position

    const isCompleted = this.correctAnswers >= 10 ||
      (shouldAdvance && request.position >= 10)

    let completionReason: 'all_found' | 'all_tries_exhausted' | undefined
    if (isCompleted) {
      completionReason = this.correctAnswers >= 10 ? 'all_found' : 'all_tries_exhausted'
    }

    return {
      isCorrect,
      correctGame: this.mockCorrectGame,
      scoreEarned,
      totalScore: this.totalLockedScore,
      triesRemaining,
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
