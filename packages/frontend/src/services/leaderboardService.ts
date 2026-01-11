import type { LeaderboardService, LeaderboardEntry } from './types'

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
      const response = await fetch(`${this.baseUrl}/leaderboard/today`)

      if (!response.ok) {
        throw new Error(`Failed to fetch leaderboard: ${response.statusText}`)
      }

      const data = await response.json()

      if (!data.success) {
        throw new Error(data.message || 'Failed to fetch leaderboard')
      }

      return data.data.entries || []
    } catch (error) {
      console.error('Leaderboard fetch error:', error)
      // Return empty array on error
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
}

/**
 * Factory function to create the leaderboard service
 */
export function createLeaderboardService(): LeaderboardService {
  return new ApiLeaderboardService()
}
