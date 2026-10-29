import type { SessionStandingResponse } from '@the-box/types'

export interface LeaderboardEntry {
  username: string
  totalScore: number
  rank?: number
}

export interface PercentileResult {
  percentile: number
  totalPlayers: number
  rank: number
}

export interface LeaderboardService {
  getTodayLeaderboard(): Promise<LeaderboardEntry[]>
  getWorldTotalScore(): Promise<number>
  getPercentile(score: number): Promise<PercentileResult>
  getSessionStanding(sessionId: string): Promise<SessionStandingResponse>
}
