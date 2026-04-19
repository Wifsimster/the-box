import type { Game, Screenshot } from '@the-box/types'
import { env } from '../../config/env.js'
import type {
  DomainLogger,
  ChallengeRepository,
  GameRepository,
  ScreenshotRepository,
  ScreenshotWithGameRecord,
  SessionRepository,
  TierRecord,
} from '../ports/index.js'

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
  metacritic?: number
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

export interface AdminService {
  // Games
  getAllGames(): Promise<Game[]>
  getGamesPaginated(options: {
    page?: number
    limit?: number
    search?: string
    sortBy?: string
    sortOrder?: 'asc' | 'desc'
  }): Promise<{ games: Game[]; total: number; page: number; limit: number }>
  createGame(data: Partial<Game>): Promise<Game>
  updateGame(id: number, data: Partial<Game>): Promise<Game | null>
  deleteGame(id: number): Promise<void>
  syncGameFromRawg(id: number): Promise<Game | null>
  // Screenshots
  getAllScreenshots(): Promise<ScreenshotWithGameRecord[]>
  getScreenshotsByGameId(gameId: number): Promise<Screenshot[]>
  createScreenshot(data: {
    gameId: number
    imageUrl: string
    thumbnailUrl?: string
    difficulty: number
    haov: number
    vaov: number
    locationHint?: string
  }): Promise<Screenshot>
  // Challenges
  getAllChallenges(): Promise<
    Array<{ id: number; challenge_date: string; created_at: Date; tiers: TierRecord[] }>
  >
  createChallenge(data: {
    challengeDate: string
    screenshotIds: number[]
  }): Promise<{ challengeId: number; date: string }>
  rerollDailyChallenge(
    date?: string,
    minMetacritic?: number
  ): Promise<{ challengeId: number; date: string; newScreenshotCount: number }>
  resetMyDailySession(
    userId: string,
    date?: string
  ): Promise<{ challengeId: number; date: string; deleted: boolean }>
}

export interface AdminServiceDeps {
  logger: DomainLogger
  gameRepository: GameRepository
  screenshotRepository: ScreenshotRepository
  challengeRepository: ChallengeRepository
  sessionRepository: SessionRepository
}

export function createAdminService(deps: AdminServiceDeps): AdminService {
  const { gameRepository, screenshotRepository, challengeRepository, sessionRepository } = deps
  void deps.logger.child({ service: 'admin' })

  return {
    // Games
    async getAllGames(): Promise<Game[]> {
      return gameRepository.findAll()
    },

    async getGamesPaginated(options) {
      return gameRepository.findPaginated(options)
    },

    async createGame(data: Partial<Game>): Promise<Game> {
      return gameRepository.create(data)
    },

    async updateGame(id: number, data: Partial<Game>): Promise<Game | null> {
      return gameRepository.update(id, data)
    },

    async deleteGame(id: number): Promise<void> {
      await gameRepository.delete(id)
    },

    async syncGameFromRawg(id: number): Promise<Game | null> {
      const game = await gameRepository.findById(id)
      if (!game) {
        return null
      }

      const rawgGame = await fetchGameFromRawg(game.slug)
      if (!rawgGame) {
        throw new Error(`Game not found on RAWG: ${game.slug}`)
      }

      const updatedGame = await gameRepository.update(id, {
        developer: rawgGame.developers?.[0]?.name ?? game.developer,
        publisher: rawgGame.publishers?.[0]?.name ?? game.publisher,
        genres: rawgGame.genres?.map(g => g.name) ?? game.genres,
        platforms: rawgGame.platforms?.map(p => p.platform.name) ?? game.platforms,
        coverImageUrl: rawgGame.background_image ?? game.coverImageUrl,
        releaseYear: rawgGame.released
          ? parseInt(rawgGame.released.slice(0, 4))
          : game.releaseYear,
        metacritic: rawgGame.metacritic ?? game.metacritic,
      })

      return updatedGame
    },

    // Screenshots
    async getAllScreenshots() {
      return screenshotRepository.findAll()
    },

    async getScreenshotsByGameId(gameId: number) {
      return screenshotRepository.findByGameId(gameId)
    },

    async createScreenshot(data): Promise<Screenshot> {
      return screenshotRepository.create(data)
    },

    // Challenges
    async getAllChallenges() {
      const challenges = await challengeRepository.findAll()

      const challengeIds = challenges.map(c => c.id)
      const tiersMap = new Map<number, TierRecord[]>()

      for (const id of challengeIds) {
        tiersMap.set(id, await challengeRepository.findTiersByChallenge(id))
      }

      return challenges.map(challenge => ({
        ...challenge,
        tiers: tiersMap.get(challenge.id) ?? [],
      }))
    },

    async createChallenge(data) {
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

    async rerollDailyChallenge(date?: string, minMetacritic?: number) {
      const targetDate = date ?? new Date().toISOString().split('T')[0]!
      const minScore = minMetacritic ?? 85

      const challenge = await challengeRepository.findByDate(targetDate)
      if (!challenge) {
        throw new Error(`No challenge found for date: ${targetDate}`)
      }

      const tiers = await challengeRepository.findTiersByChallenge(challenge.id)
      if (tiers.length === 0) {
        throw new Error(`No tier found for challenge on: ${targetDate}`)
      }
      const tier = tiers[0]!

      const newScreenshots = await screenshotRepository.findRandomNotInTier(tier.id, 10, minScore)
      if (newScreenshots.length < 10) {
        throw new Error(
          `Not enough available screenshots. Found: ${newScreenshots.length}, needed: 10`
        )
      }

      await challengeRepository.deleteTierScreenshots(tier.id)

      const newScreenshotIds = newScreenshots.map(s => s.id)
      await challengeRepository.createTierScreenshots(tier.id, newScreenshotIds)

      return {
        challengeId: challenge.id,
        date: challenge.challenge_date,
        newScreenshotCount: newScreenshotIds.length,
      }
    },

    async resetMyDailySession(userId: string, date?: string) {
      const targetDate = date ?? new Date().toISOString().split('T')[0]!

      const challenge = await challengeRepository.findByDate(targetDate)
      if (!challenge) {
        throw new Error(`No challenge found for date: ${targetDate}`)
      }

      const deleted = await sessionRepository.deleteGameSession(userId, challenge.id)

      return {
        challengeId: challenge.id,
        date: challenge.challenge_date,
        deleted,
      }
    },
  }
}
