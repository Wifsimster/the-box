import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  ADVANCED_STATS_MONTHS,
  PUBLIC_PROFILE_RECENT_SESSIONS,
  buildAdvancedStats,
  buildPublicProfile,
  createPlayerStatsService,
} from './player-stats.service.js'
import type {
  AdvancedStatsAggregates,
  PlayerStatsRepository,
  PublicProfileAggregates,
} from '../ports/player-stats.js'

const emptyAdvanced: AdvancedStatsAggregates = {
  scores: null,
  solveTimes: null,
  hintUsage: { lettersRevealed: null, legacyMetadataHints: null },
  monthlyScores: [],
}

describe('buildAdvancedStats', () => {
  it('renders zeros for a premium user who has never completed a session', () => {
    // Postgres returns NULL for every percentile over an empty set. The panel
    // renders numbers, so nothing may reach it as null.
    const stats = buildAdvancedStats(emptyAdvanced, {})

    assert.equal(stats.bestScore, 0)
    assert.equal(stats.averageScore, 0)
    assert.equal(stats.solveTimeMs.median, 0)
    assert.equal(stats.solveTimeMs.mean, 0)
    assert.equal(stats.hintUsage.hintLetter, 0)
    assert.equal(stats.streaks.current, 0)
    assert.equal(stats.streaks.longest, 0)
    assert.deepEqual(stats.monthlyScores, [])
  })

  it('rounds averages and percentiles, which arrive as fractional strings', () => {
    const stats = buildAdvancedStats(
      {
        ...emptyAdvanced,
        scores: { best: '2000', avg: '1234.5678', total: '42', perfect: '3' },
        solveTimes: { p25: '1500.4', median: '2500.5', p75: '4000.6', mean: '2800.9' },
      },
      { currentStreak: 7, longestStreak: 19 }
    )

    assert.equal(stats.bestScore, 2000)
    assert.equal(stats.averageScore, 1235, 'mean score is rounded, not truncated')
    assert.equal(stats.totalCompletedSessions, 42)
    assert.equal(stats.perfectSessions, 3)
    assert.equal(stats.solveTimeMs.p25, 1500)
    assert.equal(stats.solveTimeMs.median, 2501)
    assert.equal(stats.solveTimeMs.p75, 4001)
    assert.equal(stats.solveTimeMs.mean, 2801)
    assert.equal(stats.streaks.current, 7)
    assert.equal(stats.streaks.longest, 19)
  })

  it('keeps the retired metadata hints separate from letter reveals', () => {
    const stats = buildAdvancedStats(
      { ...emptyAdvanced, hintUsage: { lettersRevealed: '31', legacyMetadataHints: '4' } },
      {}
    )

    assert.equal(stats.hintUsage.hintLetter, 31)
    assert.equal(stats.hintUsage.legacyMetadataHints, 4)
  })

  it('preserves the order of the monthly progression rows', () => {
    const stats = buildAdvancedStats(
      {
        ...emptyAdvanced,
        monthlyScores: [
          { month: '2026-01', total: '1000', sessions: '2' },
          { month: '2026-02', total: '3000', sessions: '5' },
        ],
      },
      {}
    )

    assert.deepEqual(stats.monthlyScores, [
      { month: '2026-01', totalScore: 1000, sessionCount: 2 },
      { month: '2026-02', totalScore: 3000, sessionCount: 5 },
    ])
  })
})

describe('buildPublicProfile', () => {
  const identity = {
    username: 'pixel',
    displayName: 'Pixel',
    avatarUrl: 'https://cdn.example/a.png',
    createdAt: '2026-01-01T00:00:00.000Z',
    totalScore: 5000,
    currentStreak: 4,
    longestStreak: 12,
  }

  const aggregates: PublicProfileAggregates = {
    gamesPlayed: '17',
    recentSessions: [
      {
        challengeDate: '2026-03-01',
        totalScore: '1800',
        completedAt: new Date('2026-03-01T18:30:00.000Z'),
      },
    ],
    badges: [{ item_key: 'founder', quantity: 1 }],
  }

  it('maps the aggregates onto the public shape', () => {
    const profile = buildPublicProfile(identity, aggregates)

    assert.equal(profile.username, 'pixel')
    assert.equal(profile.gamesPlayed, 17)
    assert.equal(profile.longestStreak, 12)
    assert.deepEqual(profile.badges, [{ key: 'founder', quantity: 1 }])
    assert.equal(profile.recentSessions[0]?.totalScore, 1800)
    assert.equal(profile.recentSessions[0]?.completedAt, '2026-03-01T18:30:00.000Z')
  })

  it('never leaks an id, email or session id', () => {
    // A session id here would let an anonymous visitor pivot to
    // /api/leaderboard/session/:id and read today's answers.
    const profile = buildPublicProfile(identity, aggregates) as unknown as Record<string, unknown>
    const serialized = JSON.stringify(profile)

    assert.equal(profile['id'], undefined)
    assert.equal(profile['email'], undefined)
    assert.ok(!serialized.includes('sessionId'), 'no session id in the payload')
    for (const session of profile['recentSessions'] as Array<Record<string, unknown>>) {
      assert.equal(session['sessionId'], undefined)
    }
  })

  it('defaults a missing longest streak to zero and omits a missing avatar', () => {
    const { avatarUrl: _avatarUrl, longestStreak: _longestStreak, ...bare } = identity
    const profile = buildPublicProfile(bare, { gamesPlayed: 0, recentSessions: [], badges: [] })

    assert.equal(profile.longestStreak, 0)
    assert.equal(profile.avatarUrl, undefined)
  })

  it('tolerates a session whose challenge date could not be resolved', () => {
    const profile = buildPublicProfile(identity, {
      gamesPlayed: 1,
      recentSessions: [{ challengeDate: '', totalScore: 900, completedAt: null }],
      badges: [],
    })

    assert.equal(profile.recentSessions[0]?.challengeDate, '')
    assert.equal(profile.recentSessions[0]?.completedAt, null)
  })
})

describe('createPlayerStatsService', () => {
  it('asks the repository for the documented window sizes', async () => {
    const calls: Array<{ method: string; userId: string; size: number }> = []

    const playerStatsRepository: PlayerStatsRepository = {
      async fetchAdvancedStats(userId, monthsOfHistory) {
        calls.push({ method: 'advanced', userId, size: monthsOfHistory })
        return emptyAdvanced
      },
      async fetchPublicProfileAggregates(userId, recentLimit) {
        calls.push({ method: 'profile', userId, size: recentLimit })
        return { gamesPlayed: 0, recentSessions: [], badges: [] }
      },
    }

    const service = createPlayerStatsService({
      logger: { debug() {}, info() {}, warn() {}, error() {} },
      playerStatsRepository,
      streakLookup: { findById: async () => ({ currentStreak: 2, longestStreak: 9 }) },
    })

    const stats = await service.getAdvancedStats('u1')
    await service.getPublicProfile({
      id: 'a',
      username: 'a',
      displayName: 'A',
      createdAt: '2026-01-01T00:00:00.000Z',
      totalScore: 0,
      currentStreak: 0,
    })

    assert.deepEqual(calls, [
      { method: 'advanced', userId: 'u1', size: ADVANCED_STATS_MONTHS },
      { method: 'profile', userId: 'a', size: PUBLIC_PROFILE_RECENT_SESSIONS },
    ])
    assert.equal(stats.streaks.current, 2, 'streaks come from the user record, not the aggregates')
    assert.equal(stats.streaks.longest, 9)
  })
})
