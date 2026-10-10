import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { createLeaderboardIpCapGuard, LEADERBOARD_IP_CAP } from './leaderboard-ip-cap.service.js'
import type { DomainLogger } from '../ports/logger.js'
import type { LeaderboardIpSlotStore } from '../ports/repositories.js'

const silentLogger: DomainLogger = {
  child: () => silentLogger,
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
}

/** In-memory twin of leaderboard-ip-slot.repository.ts. */
function memoryStore() {
  const rows: Array<{ day: string; ipHash: string; userId: string }> = []
  const seenHashes: string[] = []
  const store: LeaderboardIpSlotStore = {
    async claimSlot(day, ipHash, userId, cap) {
      seenHashes.push(ipHash)
      const holders = rows.filter((r) => r.day === day && r.ipHash === ipHash).map((r) => r.userId)
      if (holders.includes(userId)) return true
      if (holders.length >= cap) return false
      rows.push({ day, ipHash, userId })
      return true
    },
    async purgeBefore(today) {
      const before = rows.length
      for (let i = rows.length - 1; i >= 0; i--) if (rows[i]!.day < today) rows.splice(i, 1)
      return before - rows.length
    },
  }
  return { store, rows, seenHashes }
}

// Deterministic stand-in for the keyed hash: day-dependent, IP-hiding.
const fakeHash = (ip: string, day: string) => `h(${day}|${ip.length}|${[...ip].reduce((a, c) => a + c.charCodeAt(0), 0)})`

const DAY = '2026-10-10'
const NEXT_DAY = '2026-10-11'

describe('leaderboard ip cap guard', () => {
  it('uses a cap of 5 players per connection per day', () => {
    assert.equal(LEADERBOARD_IP_CAP, 5)
  })

  it('ranks the first 5 players of a connection and not the 6th', async () => {
    const { store } = memoryStore()
    const guard = createLeaderboardIpCapGuard({ logger: silentLogger, store, hashIp: fakeHash })
    const results = []
    for (let i = 1; i <= 6; i++) {
      results.push(await guard.claim({ userId: `u${i}`, clientIp: '203.0.113.7', day: DAY }))
    }
    assert.deepEqual(results, [true, true, true, true, true, false])
  })

  it('keeps a slot for a player who already holds it', async () => {
    const { store } = memoryStore()
    const guard = createLeaderboardIpCapGuard({ logger: silentLogger, store, hashIp: fakeHash, cap: 1 })
    assert.equal(await guard.claim({ userId: 'u1', clientIp: '203.0.113.7', day: DAY }), true)
    assert.equal(await guard.claim({ userId: 'u1', clientIp: '203.0.113.7', day: DAY }), true)
    assert.equal(await guard.claim({ userId: 'u2', clientIp: '203.0.113.7', day: DAY }), false)
  })

  it('counts each connection separately', async () => {
    const { store } = memoryStore()
    const guard = createLeaderboardIpCapGuard({ logger: silentLogger, store, hashIp: fakeHash, cap: 1 })
    assert.equal(await guard.claim({ userId: 'u1', clientIp: '203.0.113.7', day: DAY }), true)
    assert.equal(await guard.claim({ userId: 'u2', clientIp: '198.51.100.4', day: DAY }), true)
  })

  it('starts fresh the next day and purges the previous day', async () => {
    const { store, rows } = memoryStore()
    const guard = createLeaderboardIpCapGuard({ logger: silentLogger, store, hashIp: fakeHash, cap: 1 })
    await guard.claim({ userId: 'u1', clientIp: '203.0.113.7', day: DAY })
    assert.equal(await guard.claim({ userId: 'u2', clientIp: '203.0.113.7', day: DAY }), false)

    assert.equal(await guard.claim({ userId: 'u2', clientIp: '203.0.113.7', day: NEXT_DAY }), true)
    assert.deepEqual(rows.map((r) => r.day), [NEXT_DAY])
  })

  it('never hands the raw IP to the store', async () => {
    const { store, seenHashes } = memoryStore()
    const guard = createLeaderboardIpCapGuard({ logger: silentLogger, store, hashIp: fakeHash })
    await guard.claim({ userId: 'u1', clientIp: '203.0.113.7', day: DAY })
    assert.equal(seenHashes.length, 1)
    assert.ok(!seenHashes[0]!.includes('203.0.113.7'))
  })

  it('fails open without an IP', async () => {
    const { store, seenHashes } = memoryStore()
    const guard = createLeaderboardIpCapGuard({ logger: silentLogger, store, hashIp: fakeHash, cap: 0 })
    assert.equal(await guard.claim({ userId: 'u1', clientIp: undefined, day: DAY }), true)
    assert.equal(seenHashes.length, 0)
  })

  it('fails open when storage errors', async () => {
    const store: LeaderboardIpSlotStore = {
      claimSlot: async () => { throw new Error('db down') },
      purgeBefore: async () => 0,
    }
    const guard = createLeaderboardIpCapGuard({ logger: silentLogger, store, hashIp: fakeHash })
    assert.equal(await guard.claim({ userId: 'u1', clientIp: '203.0.113.7', day: DAY }), true)
  })
})
