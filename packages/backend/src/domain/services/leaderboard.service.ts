import { challengeRepository, leaderboardRepository } from '../../infrastructure/repositories/index.js'
import type { LeaderboardResponse, PercentileResponse, MonthlyLeaderboardResponse } from '@the-box/types'

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

  async getTodayPercentile(score: number): Promise<PercentileResponse> {
    const today = new Date().toISOString().split('T')[0]!

    const challenge = await challengeRepository.findByDate(today)

    if (!challenge) {
      // No challenge today, return default values
      return { percentile: 100, totalPlayers: 0, rank: 1 }
    }

    return leaderboardRepository.getPercentileForScore(challenge.id, score)
  },

  async getMonthlyLeaderboard(year: number, month: number): Promise<MonthlyLeaderboardResponse> {
    // Validate month (1-12)
    if (month < 1 || month > 12) {
      throw new Error('Invalid month. Must be between 1 and 12')
    }

    // Prevent future months
    const now = new Date()
    const currentYear = now.getFullYear()
    const currentMonth = now.getMonth() + 1 // getMonth() returns 0-11

    if (year > currentYear || (year === currentYear && month > currentMonth)) {
      throw new Error('Cannot request leaderboard for future months')
    }

    const entries = await leaderboardRepository.findByMonth(year, month)

    return {
      year,
      month,
      entries,
    }
  },
}
