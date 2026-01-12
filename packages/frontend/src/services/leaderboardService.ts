import type { LeaderboardService, LeaderboardEntry, PercentileResult } from './types'
import { fetchWithRetry, parseApiError, logError } from '@/lib/errors'

/**
 * API-based leaderboard service
 */
export class ApiLeaderboardService implements LeaderboardService {
  private readonly baseUrl: string

  constructor(baseUrl = '/api') {
    this.baseUrl = baseUrl
  }

  async getTodayLeaderboard(): Promise<LeaderboardEntry[]> {
    try {
      // Use fetchWithRetry for automatic retry
      const response = await fetchWithRetry(
        `${this.baseUrl}/leaderboard/today`,
        undefined,
        { maxRetries: 3, delayMs: 1000 }
      )

      if (!response.ok) {
        throw await parseApiError(response)
      }

      const data = await response.json()

      if (!data.success) {
        throw new Error(data.error?.message || 'Failed to fetch leaderboard')
      }

      return data.data.entries || []
    } catch (error) {
      logError(error, 'LeaderboardService')
      // Return empty array on error so UI doesn't break
      return []
    }
  }

  async getWorldTotalScore(): Promise<number> {
    try {
      const entries = await this.getTodayLeaderboard()
      return entries.reduce((sum, entry) => sum + entry.totalScore, 0)
    } catch (error) {
      console.error('World score calculation error:', error)
      return 0
    }
  }

  async getPercentile(score: number): Promise<PercentileResult> {
    try {
      const response = await fetchWithRetry(
        `${this.baseUrl}/leaderboard/today/percentile?score=${score}`,
        undefined,
        { maxRetries: 2, delayMs: 500 }
      )

      if (!response.ok) {
        throw await parseApiError(response)
      }

      const data = await response.json()

      if (!data.success) {
        throw new Error(data.error?.message || 'Failed to fetch percentile')
      }

      return data.data
    } catch (error) {
      logError(error, 'LeaderboardService.getPercentile')
      // Return default values on error
      return { percentile: 0, totalPlayers: 0, rank: 0 }
    }
  }
}

/**
 * Factory function to create the leaderboard service
 */
export function createLeaderboardService(): LeaderboardService {
  return new ApiLeaderboardService()
}
