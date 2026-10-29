import type { LogWriter } from '../ports/logger.js'
import type {
  AdminAnalyticsRepository,
  AtRiskStreakRow,
  Counter,
  GrowthStatsCounters,
  RecentlyActiveUserRow,
  TopPlayerByScoreRow,
  TopPlayerBySessionsRow,
  UserAnalyticsCounters,
} from '../ports/analytics.js'

function count(value: Counter): number {
  const n = Number(value ?? 0)
  return Number.isFinite(n) ? n : 0
}

export function percent(numerator: number, denominator: number): number {
  if (denominator === 0) return 0
  return Math.round((numerator / denominator) * 1000) / 10
}

function round2(value: Counter): number {
  return Math.round(count(value) * 100) / 100
}

function iso(date: Date | null | undefined): string | null {
  return date?.toISOString() ?? null
}

function displayName(row: { username: string | null; name: string }): string {
  return row.username ?? row.name
}

export interface UserAnalyticsReport {
  users: {
    total: number
    verified: number
    banned: number
    everPlayed: number
    neverPlayed: number
    retentionRate30dPercent: number
  }
  active: { last24h: number; last7d: number; last30d: number }
  signups: { last24h: number; last7d: number; last30d: number }
  sessions: {
    total: number
    completed: number
    catchUp: number
    avgPerPlayer: number
    avgCompletedPerPlayer: number
  }
  engagement: {
    neverPlayed: number
    onceOnly: number
    lightPlayers: number
    regularPlayers: number
    powerPlayers: number
  }
  loginStreak: {
    averageCurrent: number
    longestEver: number
    usersWithActiveStreak: number
  }
  timeline: Array<{ day: string; activeUsers: number; newSignups: number }>
  topBySessions: Array<{
    userId: string
    displayName: string
    sessions: number
    completed: number
    totalScore: number
    lastPlayedAt: string | null
  }>
  topByScore: Array<{
    userId: string
    displayName: string
    totalScore: number
    currentStreak: number
    lastPlayedAt: string | null
  }>
  recentlyActive: Array<{
    userId: string
    displayName: string
    email: string
    createdAt: string | null
    lastLoginAt: string | null
    lastPlayedAt: string | null
    totalScore: number
    currentStreak: number
    banned: boolean
  }>
  churn: {
    everActive: number
    inactive30d: number
    inactive60d: number
    inactive90d: number
    churnRate30dPercent: number
    churnRate60dPercent: number
    churnRate90dPercent: number
    stickinessPercent: number
    activeDaily: number
    activeWeekly: number
    activeMonthly: number
  }
  dormancy: {
    active: number
    warm: number
    atRisk: number
    dormant: number
    lost: number
    neverLoggedIn: number
  }
  funnel: {
    signups30d: number
    playedAtLeastOnce: number
    stillActiveAfter7d: number
    activationRatePercent: number
    week1RetentionPercent: number
  }
  atRiskStreaks: Array<{
    userId: string
    displayName: string
    email: string
    currentStreak: number
    lastLoginAt: string | null
    lastPlayedAt: string | null
    totalScore: number
  }>
}

export interface GrowthStatsReport {
  referrals: {
    claimedTotal: number
    topReferrers: Array<{ userId: string; displayName: string; count: number }>
  }
  consent: {
    consentedUsers: number
    totalNonGuestUsers: number
    ratePercent: number
  }
  streakRiskEmail: { sentLast24h: number; sentLast7d: number; lastSentAt: string | null }
  relanceEmail: { sentLast24h: number; sentLast7d: number; lastSentAt: string | null }
}

function mapTopBySessions(rows: TopPlayerBySessionsRow[]): UserAnalyticsReport['topBySessions'] {
  return rows.map((row) => ({
    userId: row.user_id,
    displayName: displayName(row),
    sessions: count(row.sessions),
    completed: count(row.completed),
    totalScore: count(row.total_score),
    lastPlayedAt: iso(row.last_played_at),
  }))
}

function mapTopByScore(rows: TopPlayerByScoreRow[]): UserAnalyticsReport['topByScore'] {
  return rows.map((row) => ({
    userId: row.id,
    displayName: displayName(row),
    totalScore: count(row.total_score),
    currentStreak: count(row.current_streak),
    lastPlayedAt: iso(row.last_played_at),
  }))
}

function mapRecentlyActive(rows: RecentlyActiveUserRow[]): UserAnalyticsReport['recentlyActive'] {
  return rows.map((row) => ({
    userId: row.id,
    displayName: displayName(row),
    email: row.email,
    createdAt: iso(row.createdAt),
    lastLoginAt: iso(row.lastLoginAt),
    lastPlayedAt: iso(row.last_played_at),
    totalScore: count(row.total_score),
    currentStreak: count(row.current_streak),
    banned: Boolean(row.banned),
  }))
}

function mapAtRiskStreaks(rows: AtRiskStreakRow[]): UserAnalyticsReport['atRiskStreaks'] {
  return rows.map((row) => ({
    userId: row.id,
    displayName: displayName(row),
    email: row.email,
    currentStreak: count(row.current_streak),
    lastLoginAt: iso(row.lastLoginAt),
    lastPlayedAt: iso(row.last_played_at),
    totalScore: count(row.total_score),
  }))
}

export function buildUserAnalyticsReport(raw: UserAnalyticsCounters): UserAnalyticsReport {
  const totalUsers = count(raw.totals?.total)
  const everPlayed = count(raw.totals?.ever_played)
  const activeD1 = count(raw.activeUsers?.d1)
  const activeD7 = count(raw.activeUsers?.d7)
  const activeD30 = count(raw.activeUsers?.d30)

  const everActive = count(raw.churn?.ever_active)
  const inactive30 = count(raw.churn?.inactive_30d)
  const inactive60 = count(raw.churn?.inactive_60d)
  const inactive90 = count(raw.churn?.inactive_90d)

  const signupCount = count(raw.funnel?.signed_up)
  const playedCount = count(raw.funnel?.played)
  const stillActive7dCount = count(raw.funnel?.still_active_7d)

  return {
    users: {
      total: totalUsers,
      verified: count(raw.totals?.verified),
      banned: count(raw.totals?.banned),
      everPlayed,
      neverPlayed: Math.max(0, totalUsers - everPlayed),
      retentionRate30dPercent: percent(activeD30, totalUsers),
    },
    active: { last24h: activeD1, last7d: activeD7, last30d: activeD30 },
    signups: {
      last24h: count(raw.newUsers?.d1),
      last7d: count(raw.newUsers?.d7),
      last30d: count(raw.newUsers?.d30),
    },
    sessions: {
      total: count(raw.sessionTotals?.total),
      completed: count(raw.sessionTotals?.completed),
      catchUp: count(raw.sessionTotals?.catch_up),
      avgPerPlayer: round2(raw.sessionAverages?.avg_sessions),
      avgCompletedPerPlayer: round2(raw.sessionAverages?.avg_completed),
    },
    engagement: {
      neverPlayed: count(raw.engagementBuckets?.never),
      onceOnly: count(raw.engagementBuckets?.b1),
      lightPlayers: count(raw.engagementBuckets?.b2_5),
      regularPlayers: count(raw.engagementBuckets?.b6_20),
      powerPlayers: count(raw.engagementBuckets?.b21_plus),
    },
    loginStreak: {
      averageCurrent: round2(raw.loginStreaks?.avg_current),
      longestEver: count(raw.loginStreaks?.max_streak),
      usersWithActiveStreak: count(raw.loginStreaks?.with_streak),
    },
    timeline: raw.dailyActivity.map((row) => ({
      day: row.day,
      activeUsers: count(row.active),
      newSignups: count(row.new_signups),
    })),
    topBySessions: mapTopBySessions(raw.topBySessions),
    topByScore: mapTopByScore(raw.topByScore),
    recentlyActive: mapRecentlyActive(raw.recentlyActive),
    churn: {
      everActive,
      inactive30d: inactive30,
      inactive60d: inactive60,
      inactive90d: inactive90,
      churnRate30dPercent: percent(inactive30, everActive),
      churnRate60dPercent: percent(inactive60, everActive),
      churnRate90dPercent: percent(inactive90, everActive),
      stickinessPercent: percent(activeD1, activeD30),
      activeDaily: activeD1,
      activeWeekly: activeD7,
      activeMonthly: activeD30,
    },
    dormancy: {
      active: count(raw.dormancy?.active),
      warm: count(raw.dormancy?.warm),
      atRisk: count(raw.dormancy?.at_risk),
      dormant: count(raw.dormancy?.dormant),
      lost: count(raw.dormancy?.lost),
      neverLoggedIn: count(raw.dormancy?.never_logged),
    },
    funnel: {
      signups30d: signupCount,
      playedAtLeastOnce: playedCount,
      stillActiveAfter7d: stillActive7dCount,
      activationRatePercent: percent(playedCount, signupCount),
      week1RetentionPercent: percent(stillActive7dCount, signupCount),
    },
    atRiskStreaks: mapAtRiskStreaks(raw.atRiskStreaks),
  }
}

export function buildGrowthStatsReport(raw: GrowthStatsCounters): GrowthStatsReport {
  const totalUsers = count(raw.totalNonGuestUsers)
  const consentedUsers = count(raw.consented)

  return {
    referrals: {
      claimedTotal: count(raw.referralsClaimed),
      topReferrers: raw.topReferrers.map((row) => ({
        userId: row.referrer_id,
        displayName: displayName(row),
        count: count(row.count),
      })),
    },
    consent: {
      consentedUsers,
      totalNonGuestUsers: totalUsers,
      ratePercent: percent(consentedUsers, totalUsers),
    },
    streakRiskEmail: {
      sentLast24h: count(raw.streakRiskEmailLast24h),
      sentLast7d: count(raw.streakRiskEmailLast7d),
      lastSentAt: iso(raw.streakRiskEmailLastSentAt),
    },
    relanceEmail: {
      sentLast24h: count(raw.relanceEmailLast24h),
      sentLast7d: count(raw.relanceEmailLast7d),
      lastSentAt: iso(raw.relanceEmailLastSentAt),
    },
  }
}

export interface AdminAnalyticsServiceDeps {
  logger: LogWriter
  analyticsRepository: AdminAnalyticsRepository
}

export interface AdminAnalyticsService {
  getUserAnalytics(): Promise<UserAnalyticsReport>
  getGrowthStats(): Promise<GrowthStatsReport>
}

export function createAdminAnalyticsService(
  deps: AdminAnalyticsServiceDeps
): AdminAnalyticsService {
  const { logger, analyticsRepository } = deps

  return {
    async getUserAnalytics(): Promise<UserAnalyticsReport> {
      logger.debug('building user analytics report')
      return buildUserAnalyticsReport(await analyticsRepository.fetchUserAnalytics())
    },

    async getGrowthStats(): Promise<GrowthStatsReport> {
      logger.debug('building growth stats report')
      return buildGrowthStatsReport(await analyticsRepository.fetchGrowthStats())
    },
  }
}
