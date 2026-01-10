import { challengeRepository, leaderboardRepository } from '../../infrastructure/repositories/index.js'
import type { LeaderboardResponse } from '@the-box/types'

export const leaderboardService = {
  async getTodayLeaderboard(): Promise<LeaderboardResponse> {
    const today = new Date().toISOString().split('T')[0]!

    const challenge = await challengeRepository.findByDate(today)

    if (!challenge) {
      return {
        date: today,
        entries: [],
      }
    }

    const entries = await leaderboardRepository.findByChallenge(challenge.id)

    return {
      date: today,
      challengeId: challenge.id,
      entries,
    }
  },

  async getLeaderboardByDate(date: string): Promise<LeaderboardResponse> {
    // Validate date format
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      throw new Error('Invalid date format. Use YYYY-MM-DD')
    }

    const challenge = await challengeRepository.findByDate(date)

    if (!challenge) {
      return {
        date,
        entries: [],
      }
    }

    const entries = await leaderboardRepository.findByChallenge(challenge.id)

    return {
      date,
      challengeId: challenge.id,
      entries,
    }
  },
}
