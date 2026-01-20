import type { Game, TierScreenshot } from '@the-box/types'
import type { GameValidationService, GuessValidation } from './types'

/**
 * Mock game validation service for development
 */
export class MockGameValidationService implements GameValidationService {
  async validateGuess(
    guessedGame: Game | null,
    _screenshot: TierScreenshot | null
  ): Promise<GuessValidation> {
    // Simulate network delay
    await new Promise((resolve) => setTimeout(resolve, 100))

    // Mock correct answer (The Witcher 3)
    const correctGame: Game = {
      id: 1,
      name: 'The Witcher 3: Wild Hunt',
      slug: 'witcher-3',
      aliases: ['Witcher 3', 'TW3'],
      releaseYear: 2015,
    }

    const isCorrect = guessedGame?.name === correctGame.name

    return {
      isCorrect,
      correctGame,
    }
  }
}

/**
 * API-based game validation service
 */
export class ApiGameValidationService implements GameValidationService {
  private readonly baseUrl: string

  constructor(baseUrl = '/api') {
    this.baseUrl = baseUrl
  }

  async validateGuess(
    guessedGame: Game | null,
    screenshot: TierScreenshot | null
  ): Promise<GuessValidation> {
    if (!screenshot) {
      throw new Error('No screenshot available for validation')
    }

    try {
      const response = await fetch(`${this.baseUrl}/guess/validate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          screenshotId: screenshot.id,
          guessedGameId: guessedGame?.id || null,
        }),
      })

      if (!response.ok) {
        throw new Error(`Validation failed: ${response.statusText}`)
      }

      const data = await response.json()

      if (!data.success) {
        throw new Error(data.message || 'Validation failed')
      }

      return {
        isCorrect: data.data.isCorrect,
        correctGame: data.data.correctGame,
      }
    } catch (error) {
      console.error('Guess validation error:', error)
      throw error
    }
  }
}

/**
 * Factory function to create the game validation service
 */
export function createGameValidationService(): GameValidationService {
  // TODO: Switch to ApiGameValidationService when API is ready
  // return new ApiGameValidationService()
  return new MockGameValidationService()
}
