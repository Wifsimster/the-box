import type { Game } from '@the-box/types'
import type { GameSearchService } from './types'

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
        game.aliases.some((alias) => alias.toLowerCase().includes(lowerQuery))
    )
  }
}

/**
 * API-based game search service
 */
export class ApiGameSearchService implements GameSearchService {
  private readonly baseUrl: string

  constructor(baseUrl = '/api') {
    this.baseUrl = baseUrl
  }

  async search(query: string): Promise<Game[]> {
    try {
      const response = await fetch(
        `${this.baseUrl}/games/search?q=${encodeURIComponent(query)}`
      )

      if (!response.ok) {
        throw new Error(`Search failed: ${response.statusText}`)
      }

      const data = await response.json()

      if (!data.success) {
        throw new Error(data.message || 'Search failed')
      }

      return data.data || []
    } catch (error) {
      console.error('Game search error:', error)
      // Return empty array on error rather than throwing
      return []
    }
  }
}

/**
 * Factory function to create the game search service
 * Uses mock service for now, can be switched to API when ready
 */
export function createGameSearchService(): GameSearchService {
  // TODO: Switch to ApiGameSearchService when API is ready
  // return new ApiGameSearchService()
  return new MockGameSearchService()
}
