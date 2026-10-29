import type { Counter } from './analytics.js'

export interface ScoreAggregates {
  best: Counter
  avg: Counter
  total: Counter
  perfect: Counter
}

export interface SolveTimeAggregates {
  p25: Counter
  median: Counter
  p75: Counter
  mean: Counter
}

export interface HintUsageAggregates {
  lettersRevealed: Counter
  legacyMetadataHints: Counter
}

export interface MonthlyScoreRow {
  month: string
  total: Counter
  sessions: Counter
}

export interface AdvancedStatsAggregates {
  scores: ScoreAggregates | null
  solveTimes: SolveTimeAggregates | null
  hintUsage: HintUsageAggregates
  monthlyScores: MonthlyScoreRow[]
}

export interface RecentSessionRow {
  challengeDate: string
  totalScore: Counter
  completedAt: Date | null
}

export interface InventoryBadgeRow {
  item_key: string
  quantity: number
}

export interface PublicProfileAggregates {
  gamesPlayed: Counter
  recentSessions: RecentSessionRow[]
  badges: InventoryBadgeRow[]
}

export interface PlayerStatsRepository {
  fetchPublicProfileAggregates(
    userId: string,
    recentLimit: number
  ): Promise<PublicProfileAggregates>
  fetchAdvancedStats(userId: string, monthsOfHistory: number): Promise<AdvancedStatsAggregates>
}
