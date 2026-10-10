import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { createLeaderboardService } from './leaderboard.service.js'
import type { DomainLogger } from '../ports/logger.js'
import type { DailyChallengeLookup, LeaderboardRepository } from '../ports/index.js'
import type { LeaderboardEntry } from '@the-box/types'
import type { CountryPlayerMonthStats } from './country-leaderboard.js'

const silentLogger: DomainLogger = {
  child: () => silentLogger,
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
}

function makeService(opts: {
  challengeForDate?: { id: number } | null
  entries?: LeaderboardEntry[]
  playerCount?: number
  countryPlayers?: CountryPlayerMonthStats[]
}) {
  // No cast: `DailyChallengeLookup` is the two-method slice the service
  // actually uses, so an honest fake satisfies it.
  // No cast: `DailyChallengeLookup` is the two-method slice the service
  // actually uses, so an honest fake satisfies it — and the compiler now
  // checks the fixture is a real ChallengeRecord instead of taking the
  // `as unknown as` cast's word for it.
  const challengeRepository: DailyChallengeLookup = {
    findByDate: async () =>
      opts.challengeForDate
        ? { ...opts.challengeForDate, challenge_date: '2026-01-01', created_at: new Date(0) }
        : null,
    findById: async () => null,
  }

  let lastLimit: number | undefined
  const leaderboardRepository: LeaderboardRepository = {
    findByChallenge: async (_id: number, limit?: number) => {
      lastLimit = limit
      return opts.entries ?? []
    },
    countPlayersByChallenge: async () => opts.playerCount ?? 0,
    findByMonth: async () => [],
    findCountryPlayerStatsByMonth: async () => opts.countryPlayers ?? [],
    getPercentileForScore: async () => ({ percentile: 0, totalPlayers: 0, rank: 0 }),
  }

  const service = createLeaderboardService({
    logger: silentLogger,
    challengeRepository,
    leaderboardRepository,
  })
  return { service, getLastLimit: () => lastLimit }
}

const leaderEntry: LeaderboardEntry = {
  rank: 1,
  userId: 'user-1',
  username: 'pixel',
  displayName: 'PixelHero',
  totalScore: 4820,
}

describe('leaderboardService.getTodayLeader', () => {
  it('returns null when there is no challenge today', async () => {
    const { service } = makeService({ challengeForDate: null })
    assert.equal(await service.getTodayLeader(), null)
  })

  it('returns null when nobody has completed a ranked session', async () => {
    const { service } = makeService({ challengeForDate: { id: 7 }, entries: [] })
    assert.equal(await service.getTodayLeader(), null)
  })

  it('projects the rank-1 entry and fetches only one row', async () => {
    const { service, getLastLimit } = makeService({
      challengeForDate: { id: 7 },
      entries: [leaderEntry],
    })
    const leader = await service.getTodayLeader()
    assert.deepEqual(leader, {
      userId: 'user-1',
      displayName: 'PixelHero',
      totalScore: 4820,
    })
    assert.equal(getLastLimit(), 1, 'should ask the repository for a single row')
  })
})

describe('leaderboardService.getTodayPlayerCount', () => {
  it('returns count 0 when there is no challenge today', async () => {
    const { service } = makeService({ challengeForDate: null, playerCount: 42 })
    const result = await service.getTodayPlayerCount()
    assert.equal(result.count, 0, 'no challenge means no ranked players')
    assert.match(result.date, /^\d{4}-\d{2}-\d{2}$/)
  })

  it('returns the ranked player count for today\'s challenge', async () => {
    const { service } = makeService({ challengeForDate: { id: 7 }, playerCount: 128 })
    const result = await service.getTodayPlayerCount()
    assert.equal(result.count, 128)
  })
})

describe('leaderboard.service — getMonthlyCountryLeaderboard', () => {
  const fivePlayers = (country: 'FR' | 'BE', avg: number, count = 5): CountryPlayerMonthStats[] =>
    Array.from({ length: count }, (_, i) => ({
      userId: `${country}-${i}`,
      countryCode: country,
      gamesPlayed: 2,
      totalScore: avg * 2,
    }))

  it('ranks countries above the threshold and reports it', async () => {
    const { service } = makeService({
      countryPlayers: [...fivePlayers('FR', 1200), ...fivePlayers('BE', 1800, 3)],
    })
    const res = await service.getMonthlyCountryLeaderboard(2026, 1)
    assert.equal(res.minPlayers, 5)
    assert.deepEqual(res.entries, [{ rank: 1, countryCode: 'FR', averageScore: 1200, playerCount: 5 }])
    assert.equal(res.viewer, undefined)
  })

  it('reports the viewer country progress, even below the threshold', async () => {
    const { service } = makeService({
      countryPlayers: [...fivePlayers('FR', 1200), ...fivePlayers('BE', 1800, 3)],
    })
    const res = await service.getMonthlyCountryLeaderboard(2026, 1, { countryCode: 'BE' })
    assert.deepEqual(res.viewer, { countryCode: 'BE', playerCount: 3 })
  })

  it('reports a viewer without a country', async () => {
    const { service } = makeService({ countryPlayers: [] })
    const res = await service.getMonthlyCountryLeaderboard(2026, 1, { countryCode: null })
    assert.deepEqual(res.viewer, { countryCode: null, playerCount: 0 })
  })

  it('refuses future months and invalid months', async () => {
    const { service } = makeService({})
    await assert.rejects(service.getMonthlyCountryLeaderboard(2999, 1), /future months/)
    await assert.rejects(service.getMonthlyCountryLeaderboard(2026, 13), /Invalid month/)
  })
})
