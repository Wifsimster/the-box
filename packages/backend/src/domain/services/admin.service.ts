import {
  gameRepository,
  screenshotRepository,
  challengeRepository,
} from '../../infrastructure/repositories/index.js'
import type { Game, Screenshot } from '@the-box/types'

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
