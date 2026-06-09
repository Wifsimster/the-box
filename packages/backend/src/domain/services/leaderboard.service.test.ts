import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { createLeaderboardService } from './leaderboard.service.js'
import type { DomainLogger } from '../ports/logger.js'
import type { ChallengeRepository, LeaderboardRepository } from '../ports/index.js'
import type { LeaderboardEntry } from '@the-box/types'

const silentLogger: DomainLogger = {
  child: () => silentLogger,
  trace: () => {},
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
  fatal: () => {},
}

function makeService(opts: {
  challengeForDate?: { id: number } | null
  entries?: LeaderboardEntry[]
}) {
  const challengeRepository = {
    findByDate: async () => opts.challengeForDate ?? null,
  } as unknown as ChallengeRepository

  let lastLimit: number | undefined
  const leaderboardRepository = {
    findByChallenge: async (_id: number, limit?: number) => {
      lastLimit = limit
      return opts.entries ?? []
    },
  } as unknown as LeaderboardRepository

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
