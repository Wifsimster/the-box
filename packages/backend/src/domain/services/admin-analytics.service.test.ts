import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildGrowthStatsReport,
  buildUserAnalyticsReport,
  createAdminAnalyticsService,
  percent,
} from './admin-analytics.service.js'
import type {
  AdminAnalyticsRepository,
  GrowthStatsCounters,
  UserAnalyticsCounters,
} from '../ports/analytics.js'

// An EMPTY-but-complete counter set. Because the port is narrow and made of
// plain data, a fixture needs no `as unknown as` cast and no database.
const emptyUserCounters: UserAnalyticsCounters = {
  totals: null,
  activeUsers: null,
  newUsers: null,
  sessionTotals: null,
  sessionAverages: null,
  engagementBuckets: null,
  loginStreaks: null,
  dailyActivity: [],
  topBySessions: [],
  topByScore: [],
  recentlyActive: [],
  churn: null,
  dormancy: null,
  funnel: null,
  atRiskStreaks: [],
}

test('percent rounds to one decimal and guards a zero denominator', () => {
  assert.equal(percent(1, 3), 33.3)
  assert.equal(percent(1, 8), 12.5)
  assert.equal(percent(5, 0), 0, 'no division by zero')
  assert.equal(percent(0, 100), 0)
})

test('user analytics survives a completely empty database', () => {
  const report = buildUserAnalyticsReport(emptyUserCounters)

  assert.equal(report.users.total, 0)
  assert.equal(report.users.neverPlayed, 0)
  assert.equal(report.users.retentionRate30dPercent, 0)
  assert.equal(report.churn.churnRate30dPercent, 0)
  assert.equal(report.churn.stickinessPercent, 0)
  assert.equal(report.funnel.activationRatePercent, 0)
  assert.deepEqual(report.timeline, [])
})

test('Postgres string counters are normalized to numbers', () => {
  const report = buildUserAnalyticsReport({
    ...emptyUserCounters,
    // COUNT(*) comes back as a string over the wire.
    totals: { total: '200', verified: '150', ever_played: '80', banned: '4' },
    activeUsers: { d1: '10', d7: '40', d30: '100' },
  })

  assert.equal(report.users.total, 200)
  assert.equal(report.users.verified, 150)
  assert.equal(report.users.banned, 4)
  // 200 total - 80 who played = 120 who never did.
  assert.equal(report.users.neverPlayed, 120)
  // 100 monthly actives of 200 users.
  assert.equal(report.users.retentionRate30dPercent, 50)
  // DAU/MAU = 10/100.
  assert.equal(report.churn.stickinessPercent, 10)
})

test('never-activated users are excluded from the churn denominator', () => {
  // 1000 signups, but only 100 ever logged in; 50 of those went silent.
  // Churn must read 50% (of real users), not 5% (of all signups).
  const report = buildUserAnalyticsReport({
    ...emptyUserCounters,
    totals: { total: '1000', verified: '0', ever_played: '0', banned: '0' },
    churn: { ever_active: '100', inactive_30d: '50', inactive_60d: '25', inactive_90d: '10' },
  })

  assert.equal(report.churn.churnRate30dPercent, 50)
  assert.equal(report.churn.churnRate60dPercent, 25)
  assert.equal(report.churn.churnRate90dPercent, 10)
})

test('activation and week-1 retention are measured against the signup cohort', () => {
  const report = buildUserAnalyticsReport({
    ...emptyUserCounters,
    funnel: { signed_up: '80', played: '60', still_active_7d: '20' },
  })

  assert.equal(report.funnel.activationRatePercent, 75)
  assert.equal(report.funnel.week1RetentionPercent, 25)
})

test('username wins over the auth display name, and dates serialize to ISO', () => {
  const lastPlayed = new Date('2026-01-02T03:04:05.000Z')
  const report = buildUserAnalyticsReport({
    ...emptyUserCounters,
    topByScore: [
      { id: 'u1', username: 'neo', name: 'Thomas Anderson', total_score: '900', current_streak: '3', last_played_at: lastPlayed },
      { id: 'u2', username: null, name: 'Trinity', total_score: '800', current_streak: '1', last_played_at: null },
    ],
  })

  assert.equal(report.topByScore[0]?.displayName, 'neo')
  assert.equal(report.topByScore[1]?.displayName, 'Trinity', 'falls back to name')
  assert.equal(report.topByScore[0]?.lastPlayedAt, '2026-01-02T03:04:05.000Z')
  assert.equal(report.topByScore[1]?.lastPlayedAt, null)
  assert.equal(report.topByScore[0]?.totalScore, 900, 'string score becomes a number')
})

test('growth stats compute the marketing consent rate', () => {
  const raw: GrowthStatsCounters = {
    referralsClaimed: '12',
    consented: '30',
    totalNonGuestUsers: '400',
    topReferrers: [{ referrer_id: 'u9', username: null, name: 'Morpheus', count: '7' }],
    streakRiskEmailLast24h: '3',
    streakRiskEmailLast7d: '9',
    streakRiskEmailLastSentAt: new Date('2026-02-01T00:00:00.000Z'),
    relanceEmailLast24h: '0',
    relanceEmailLast7d: '2',
    relanceEmailLastSentAt: null,
  }

  const report = buildGrowthStatsReport(raw)

  assert.equal(report.consent.ratePercent, 7.5)
  assert.equal(report.referrals.claimedTotal, 12)
  assert.equal(report.referrals.topReferrers[0]?.displayName, 'Morpheus')
  assert.equal(report.referrals.topReferrers[0]?.count, 7)
  assert.equal(report.streakRiskEmail.lastSentAt, '2026-02-01T00:00:00.000Z')
  assert.equal(report.relanceEmail.lastSentAt, null)
})

test('the service delegates to its port exactly once per report', async () => {
  let userCalls = 0
  let growthCalls = 0

  // A hand-written port implementation — no mocking library, no cast.
  const repository: AdminAnalyticsRepository = {
    async fetchUserAnalytics() {
      userCalls++
      return emptyUserCounters
    },
    async fetchGrowthStats() {
      growthCalls++
      return {
        referralsClaimed: 0, consented: 0, totalNonGuestUsers: 0, topReferrers: [],
        streakRiskEmailLast24h: 0, streakRiskEmailLast7d: 0, streakRiskEmailLastSentAt: null,
        relanceEmailLast24h: 0, relanceEmailLast7d: 0, relanceEmailLastSentAt: null,
      }
    },
  }

  const service = createAdminAnalyticsService({
    logger: { debug() {}, info() {}, warn() {}, error() {} },
    analyticsRepository: repository,
  })

  await service.getUserAnalytics()
  await service.getGrowthStats()

  assert.equal(userCalls, 1)
  assert.equal(growthCalls, 1)
})
