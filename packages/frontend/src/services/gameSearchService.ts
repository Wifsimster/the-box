import type { Game } from '@the-box/types'
import type { GameSearchService } from './types'
import { fetchWithRetry, parseApiError, logError } from '@/lib/errors'

/**
 * Mock game search service for development and demo purposes
 */
export class MockGameSearchService implements GameSearchService {
  private readonly mockGames: Game[] = [
    {
      id: 1,
      name: 'The Witcher 3: Wild Hunt',
      slug: 'witcher-3',
      aliases: ['Witcher 3', 'TW3'],
      releaseYear: 2015,
    },
    {
      id: 2,
      name: 'The Sims 4',
      slug: 'sims-4',
      aliases: ['Sims 4', 'TS4'],
      releaseYear: 2014,
    },
    {
      id: 3,
      name: 'Red Dead Redemption 2',
      slug: 'rdr2',
      aliases: ['RDR2'],
      releaseYear: 2018,
    },
    {
      id: 4,
      name: 'Elden Ring',
      slug: 'elden-ring',
      aliases: [],
      releaseYear: 2022,
    },
    {
      id: 5,
      name: 'Minecraft',
      slug: 'minecraft',
      aliases: ['MC'],
      releaseYear: 2011,
    },
  ]

  async search(query: string): Promise<Game[]> {
    // Simulate network delay
    await new Promise((resolve) => setTimeout(resolve, 100))

    const lowerQuery = query.toLowerCase()

    return this.mockGames.filter(
      (game) =>
        game.name.toLowerCase().includes(lowerQuery) ||
        game.aliases.some((alias: string) => alias.toLowerCase().includes(lowerQuery))
    )
  }
}

/**
 * API-based game search service
 * Uses backend endpoint: GET /api/game/games/search?q=query
 */
export class ApiGameSearchService implements GameSearchService {
  private readonly baseUrl: string

  constructor(baseUrl = '/api') {
    this.baseUrl = baseUrl
  }

  async search(query: string): Promise<Game[]> {
    // API requires minimum 2 characters
    if (query.length < 2) {
      return []
    }

    try {
      // Use fetchWithRetry for automatic retry on network errors
      const response = await fetchWithRetry(
        `${this.baseUrl}/game/games/search?q=${encodeURIComponent(query)}`,
        undefined,
        { maxRetries: 2, delayMs: 500 } // Quick retry for search
      )

      if (!response.ok) {
        throw await parseApiError(response)
      }

      const data = await response.json()

      if (!data.success) {
        throw new Error(data.error?.message || 'Search failed')
      }

      // Backend returns { success: true, data: { games: Game[] } }
      return data.data?.games || []
    } catch (error) {
      logError(error, 'GameSearchService')
      // Return empty array on error rather than throwing
      // This allows the user to keep typing even if API is down
      return []
    }
  }
}

/**
 * Factory function to create the game search service
 * Uses API service by default, falls back to mock if VITE_USE_MOCK_API is true
 */
export function createGameSearchService(): GameSearchService {
  const useMock = import.meta.env.VITE_USE_MOCK_API === 'true'

  if (useMock) {
    return new MockGameSearchService()
  }

  return new ApiGameSearchService()
}
