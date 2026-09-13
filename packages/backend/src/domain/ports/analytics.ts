/**
 * Admin analytics port.
 *
 * The admin dashboard's engagement + growth panels used to be ~480 lines of
 * raw SQL living directly inside an Express handler. That put persistence
 * (Knex), business rules (churn/retention math) and transport (JSON shaping)
 * in one function in the presentation layer.
 *
 * This port is the seam: it describes the *raw counters* the domain needs,
 * in domain terms, with no Knex types in the signature. The infrastructure
 * repository satisfies it with SQL; the domain service turns the counters
 * into rates and report DTOs without ever knowing a database exists.
 */

/** A count returned by Postgres — `COUNT(*)` arrives as a string. */
export type Counter = string | number | null | undefined

export interface UserTotalsCounters {
  total: Counter
  verified: Counter
  ever_played: Counter
  banned: Counter
}

/** Counts bucketed by a trailing 24h / 7d / 30d window. */
export interface WindowedCounters {
  d1: Counter
  d7: Counter
  d30: Counter
}

export interface SessionTotalsCounters {
  total: Counter
  completed: Counter
  catch_up: Counter
}

export interface SessionAverageCounters {
  avg_sessions: Counter
  avg_completed: Counter
  players: Counter
}

export interface EngagementBucketCounters {
  never: Counter
  b1: Counter
  b2_5: Counter
  b6_20: Counter
  b21_plus: Counter
}

export interface LoginStreakCounters {
  avg_current: Counter
  max_streak: Counter
  with_streak: Counter
}

export interface DailyActivityCounters {
  day: string
  active: Counter
  new_signups: Counter
}

export interface TopPlayerBySessionsRow {
  user_id: string
  username: string | null
  name: string
  sessions: Counter
  completed: Counter
  total_score: Counter
  last_played_at: Date | null
}

export interface TopPlayerByScoreRow {
  id: string
  username: string | null
  name: string
  total_score: Counter
  current_streak: Counter
  last_played_at: Date | null
}

export interface RecentlyActiveUserRow {
  id: string
  username: string | null
  name: string
  email: string
  createdAt: Date | null
  lastLoginAt: Date | null
  last_played_at: Date | null
  total_score: Counter
  current_streak: Counter
  banned: boolean
}

export interface ChurnCounters {
  ever_active: Counter
  inactive_30d: Counter
  inactive_60d: Counter
  inactive_90d: Counter
}

export interface DormancyCounters {
  never_logged: Counter
  active: Counter
  warm: Counter
  at_risk: Counter
  dormant: Counter
  lost: Counter
}

export interface FunnelCounters {
  signed_up: Counter
  played: Counter
  still_active_7d: Counter
}

export interface AtRiskStreakRow {
  id: string
  username: string | null
  name: string
  email: string
  current_streak: Counter
  lastLoginAt: Date | null
  last_played_at: Date | null
  total_score: Counter
}

/** Everything the user-analytics report is derived from, already unwrapped. */
export interface UserAnalyticsCounters {
  totals: UserTotalsCounters | null
  activeUsers: WindowedCounters | null
  newUsers: WindowedCounters | null
  sessionTotals: SessionTotalsCounters | null
  sessionAverages: SessionAverageCounters | null
  engagementBuckets: EngagementBucketCounters | null
  loginStreaks: LoginStreakCounters | null
  dailyActivity: DailyActivityCounters[]
  topBySessions: TopPlayerBySessionsRow[]
  topByScore: TopPlayerByScoreRow[]
  recentlyActive: RecentlyActiveUserRow[]
  churn: ChurnCounters | null
  dormancy: DormancyCounters | null
  funnel: FunnelCounters | null
  atRiskStreaks: AtRiskStreakRow[]
}

export interface TopReferrerRow {
  referrer_id: string
  username: string | null
  name: string
  count: Counter
}

/** Everything the growth-stats report is derived from, already unwrapped. */
export interface GrowthStatsCounters {
  referralsClaimed: Counter
  consented: Counter
  totalNonGuestUsers: Counter
  topReferrers: TopReferrerRow[]
  streakRiskEmailLast24h: Counter
  streakRiskEmailLast7d: Counter
  streakRiskEmailLastSentAt: Date | null
  relanceEmailLast24h: Counter
  relanceEmailLast7d: Counter
  relanceEmailLastSentAt: Date | null
}

/**
 * The single outward dependency of the admin analytics service. Two calls,
 * each returning plain counters — narrow enough that a unit test can
 * implement it inline (see admin-analytics.service.test.ts) without any
 * `as unknown as` cast.
 */
export interface AdminAnalyticsRepository {
  fetchUserAnalytics(): Promise<UserAnalyticsCounters>
  fetchGrowthStats(): Promise<GrowthStatsCounters>
}
