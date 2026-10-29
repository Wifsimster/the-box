import type { Game, GuessProximityHint, NewlyEarnedAchievement } from '@the-box/types'
import {
  fetchWithRetry,
  parseApiError,
  logError,
} from '@/lib/errors'

export interface GuessSubmissionRequest {
  tierSessionId: string
  screenshotId: number
  position: number
  gameId: number | null
  guessText: string
  roundTimeTakenMs: number
}

export interface GuessSubmissionResult {
  isCorrect: boolean
  correctGame?: Game
  scoreEarned: number
  totalScore: number
  screenshotsFound: number
  nextPosition: number | null
  isCompleted: boolean
  completionReason?: 'all_found' | 'forfeit'
  letterPenalty?: number
  wrongGuessPenalty?: number
  secondChanceFloorBoost?: number
  streakBonus?: number
  streak?: number
  proximityHint?: GuessProximityHint
  matchPrecision?: 'exact' | 'partial'
  newlyEarnedAchievements?: NewlyEarnedAchievement[]
}

export interface GuessSubmissionService {
  submitGuess(request: GuessSubmissionRequest): Promise<GuessSubmissionResult>
}

class MockGuessSubmissionService implements GuessSubmissionService {
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
    await new Promise((resolve) => setTimeout(resolve, 300))

    const isCorrect = request.gameId === this.mockCorrectGame.id

    const scoreEarned = isCorrect ? 100 : 0
    const scorePenalty = isCorrect ? 0 : this.WRONG_GUESS_PENALTY

    if (isCorrect) {
      this.correctAnswers++
    }

    this.totalLockedScore = Math.max(0, this.totalLockedScore - scorePenalty) + scoreEarned

    const shouldAdvance = isCorrect

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

class ApiGuessSubmissionService implements GuessSubmissionService {
  private readonly baseUrl: string

  constructor(baseUrl = '/api') {
    this.baseUrl = baseUrl
  }

  async submitGuess(
    request: GuessSubmissionRequest
  ): Promise<GuessSubmissionResult> {
    try {
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
          retryableStatuses: [500, 502, 503, 504],
        }
      )

      if (!response.ok) {
        throw await parseApiError(response)
      }

      const data = await response.json()

      if (!data.success) {
        throw new Error(data.error?.message || 'Guess submission failed')
      }

      return data.data
    } catch (error) {
      logError(error, 'GuessSubmissionService')

      throw error
    }
  }
}

export function createGuessSubmissionService(): GuessSubmissionService {
  const useMock = import.meta.env.VITE_USE_MOCK_API === 'true'

  if (useMock) {
    return new MockGuessSubmissionService()
  }

  return new ApiGuessSubmissionService()
}
