import {
  gameRepository,
  screenshotRepository,
  challengeRepository,
} from '../../infrastructure/repositories/index.js'
import type { Game, Screenshot } from '@the-box/types'
import { env } from '../../config/env.js'

// RAWG API Types
interface RAWGGenre {
  id: number
  name: string
  slug: string
}

interface RAWGPlatform {
  platform: {
    id: number
    name: string
    slug: string
  }
}

interface RAWGDeveloper {
  id: number
  name: string
  slug: string
}

interface RAWGPublisher {
  id: number
  name: string
  slug: string
}

interface RAWGGame {
  id: number
  slug: string
  name: string
  released: string | null
  background_image: string | null
  developers?: RAWGDeveloper[]
  publishers?: RAWGPublisher[]
  genres: RAWGGenre[]
  platforms: RAWGPlatform[]
}

// Simple RAWG API client for single game fetch
async function fetchGameFromRawg(slug: string): Promise<RAWGGame | null> {
  const apiKey = env.RAWG_API_KEY
  if (!apiKey) {
    throw new Error('RAWG_API_KEY environment variable is required')
  }

  // Fetch game directly by slug using the RAWG slug endpoint
  const detailUrl = new URL(`https://api.rawg.io/api/games/${encodeURIComponent(slug)}`)
  detailUrl.searchParams.set('key', apiKey)

  const detailResponse = await fetch(detailUrl.toString())
  if (detailResponse.status === 404) {
    return null
  }
  if (!detailResponse.ok) {
    throw new Error(`RAWG API error: ${detailResponse.status} ${detailResponse.statusText}`)
  }

  return (await detailResponse.json()) as RAWGGame
}

export const adminService = {
  // Games
  async getAllGames(): Promise<Game[]> {
    return await gameRepository.findAll()
  },

  async getGamesPaginated(options: {
    page?: number
    limit?: number
    search?: string
    sortBy?: string
    sortOrder?: 'asc' | 'desc'
  }): Promise<{ games: Game[]; total: number; page: number; limit: number }> {
    return await gameRepository.findPaginated(options)
  },

  async createGame(data: Partial<Game>): Promise<Game> {
    return await gameRepository.create(data)
  },

  async updateGame(id: number, data: Partial<Game>): Promise<Game | null> {
    return await gameRepository.update(id, data)
  },

  async deleteGame(id: number): Promise<void> {
    await gameRepository.delete(id)
  },

  async syncGameFromRawg(id: number): Promise<Game | null> {
    // Get the game from database
    const game = await gameRepository.findById(id)
    if (!game) {
      return null
    }

    // Fetch data from RAWG using the game's slug
    const rawgGame = await fetchGameFromRawg(game.slug)
    if (!rawgGame) {
      throw new Error(`Game not found on RAWG: ${game.slug}`)
    }

    // Update game with RAWG data
    const updatedGame = await gameRepository.update(id, {
      developer: rawgGame.developers?.[0]?.name ?? game.developer,
      publisher: rawgGame.publishers?.[0]?.name ?? game.publisher,
      genres: rawgGame.genres?.map((g) => g.name) ?? game.genres,
      platforms: rawgGame.platforms?.map((p) => p.platform.name) ?? game.platforms,
      coverImageUrl: rawgGame.background_image ?? game.coverImageUrl,
      releaseYear: rawgGame.released ? parseInt(rawgGame.released.slice(0, 4)) : game.releaseYear,
    })

    return updatedGame
  },

  // Screenshots
  async getAllScreenshots() {
    return await screenshotRepository.findAll()
  },

  async getScreenshotsByGameId(gameId: number) {
    return await screenshotRepository.findByGameId(gameId)
  },

  async createScreenshot(data: {
    gameId: number
    imageUrl: string
    thumbnailUrl?: string
    difficulty: number
    haov: number
    vaov: number
    locationHint?: string
  }): Promise<Screenshot> {
    return await screenshotRepository.create(data)
  },

  // Challenges
  async getAllChallenges() {
    const challenges = await challengeRepository.findAll()

    // Get tiers for each challenge
    const challengeIds = challenges.map(c => c.id)
    const tiersMap = new Map<number, Awaited<ReturnType<typeof challengeRepository.findTiersByChallenge>>>()

    for (const id of challengeIds) {
      tiersMap.set(id, await challengeRepository.findTiersByChallenge(id))
    }

    return challenges.map(challenge => ({
      ...challenge,
      tiers: tiersMap.get(challenge.id) ?? [],
    }))
  },

  async createChallenge(data: {
    challengeDate: string
    screenshotIds: number[]
  }): Promise<{ challengeId: number; date: string }> {
    const challenge = await challengeRepository.create(data.challengeDate)

    // Create single "Daily Challenge" tier
    const tier = await challengeRepository.createTier({
      dailyChallengeId: challenge.id,
      tierNumber: 1,
      name: 'Daily Challenge',
      timeLimitSeconds: 30,
    })

    await challengeRepository.createTierScreenshots(tier.id, data.screenshotIds)

    return {
      challengeId: challenge.id,
      date: challenge.challenge_date,
    }
  },
}
