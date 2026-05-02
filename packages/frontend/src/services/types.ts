/**
 * Leaderboard entry interface
 */
export interface LeaderboardEntry {
  username: string
  totalScore: number
  rank?: number
}

/**
 * Percentile ranking result
 */
export interface PercentileResult {
  percentile: number
  totalPlayers: number
  rank: number
}

/**
 * Service interface for leaderboard operations
 */
export interface LeaderboardService {
  getTodayLeaderboard(): Promise<LeaderboardEntry[]>
  getWorldTotalScore(): Promise<number>
  getPercentile(score: number): Promise<PercentileResult>
}
