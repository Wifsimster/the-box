/**
 * Player statistics port.
 *
 * The premium "advanced stats" panel used to be ~125 lines of Knex —
 * percentile window functions, a retired-hint rollup, a six-month
 * progression bucket — inside an Express handler. Same shape as the admin
 * analytics problem: persistence, derivation and transport in one function
 * in the presentation layer.
 *
 * The port describes the raw aggregates in domain terms. Shaping them into
 * the `AdvancedStats` payload is the domain service's job.
 */
import type { Counter } from './analytics.js'

export interface ScoreAggregates {
  best: Counter
  avg: Counter
  total: Counter
  perfect: Counter
}

/** Solve-time distribution over correct guesses, in milliseconds. */
export interface SolveTimeAggregates {
  p25: Counter
  median: Counter
  p75: Counter
  mean: Counter
}

export interface HintUsageAggregates {
  /** Total letters revealed across every position. */
  lettersRevealed: Counter
  /**
   * Uses of the four metadata hints retired in 2026-06 (migration
   * 20260613_retire_legacy_metadata_hints). Historical guess rows are kept,
   * so the four keys are rolled up into one figure.
   */
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

/** One finished daily, as the public profile lists it. */
export interface RecentSessionRow {
  challengeDate: string
  totalScore: Counter
  completedAt: Date | null
}

export interface InventoryBadgeRow {
  item_key: string
  quantity: number
}

/** The aggregates behind a shareable public profile. */
export interface PublicProfileAggregates {
  gamesPlayed: Counter
  recentSessions: RecentSessionRow[]
  badges: InventoryBadgeRow[]
}

export interface PlayerStatsRepository {
  /**
   * @param recentLimit how many finished dailies to list.
   */
  fetchPublicProfileAggregates(
    userId: string,
    recentLimit: number
  ): Promise<PublicProfileAggregates>
  /**
   * @param monthsOfHistory how many calendar months of progression to
   *        include, counting the current month.
   */
  fetchAdvancedStats(userId: string, monthsOfHistory: number): Promise<AdvancedStatsAggregates>
}
