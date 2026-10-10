import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { createGameService, type GameServiceDeps } from './game.service.js'
import type { DomainLogger } from '../ports/logger.js'
import type { LeaderboardIpCapGuard } from './leaderboard-ip-cap.service.js'

const silentLogger: DomainLogger = {
  child: () => silentLogger,
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
}

const today = () => new Date().toISOString().slice(0, 10)
const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10)

/**
 * startChallenge harness: one challenge, one tier, an optional existing
 * session. Records what the service asked the cap guard and what it wrote.
 */
function buildHarness(opts: {
  challengeDate?: string
  existing?: { ip_capped: boolean }
  guardAnswer?: boolean
}) {
  const claims: Array<{ userId: string; clientIp: string | undefined; day: string }> = []
  const created: Array<{ isCatchUp?: boolean; ipCapped?: boolean }> = []
  const started: Array<{ isCatchUp: boolean; ipCapped: boolean }> = []

  const guard: LeaderboardIpCapGuard = {
    async claim(input) {
      claims.push(input)
      return opts.guardAnswer ?? true
    },
  }

  const sessionRow = (ipCapped: boolean, isCatchUp: boolean) => ({
    id: 'game-1',
    user_id: 'user-1',
    daily_challenge_id: 1,
    current_tier: 1,
    current_position: 1,
    total_score: 0,
    is_completed: false,
    is_catch_up: isCatchUp,
    ip_capped: ipCapped,
    started_at: new Date(),
    completed_at: null,
  })

  const deps = {
    logger: silentLogger,
    challengeRepository: {
      findTiersByChallenge: async () => [{ id: 7, time_limit_seconds: 45 }],
      findById: async () => ({ id: 1, challenge_date: opts.challengeDate ?? today() }),
    },
    sessionRepository: {
      findGameSession: async () =>
        opts.existing ? sessionRow(opts.existing.ip_capped, false) : null,
      createGameSession: async (data: { isCatchUp?: boolean; ipCapped?: boolean }) => {
        created.push(data)
        return sessionRow(data.ipCapped ?? false, data.isCatchUp ?? false)
      },
      createTierSessionIfActive: async () => ({ id: 'tier-1' }),
    },
    funnelEventRepository: { record: async () => {} },
    leaderboardIpCapGuard: guard,
    onAfterSessionStarted: async (params: { isCatchUp: boolean; ipCapped: boolean }) => {
      started.push(params)
    },
  } as unknown as GameServiceDeps

  return { service: createGameService(deps), claims, created, started }
}

describe('startChallenge — per-connection leaderboard cap', () => {
  it('ranks a new daily session while the connection is under the cap', async () => {
    const h = buildHarness({ guardAnswer: true })
    const res = await h.service.startChallenge(1, 'user-1', false, '203.0.113.7')

    assert.deepEqual(h.claims, [{ userId: 'user-1', clientIp: '203.0.113.7', day: today() }])
    assert.equal(h.created[0]!.ipCapped, false)
    assert.equal(res.sharedConnectionCapped, false)
  })

  it('flags the session, not the player, once the cap is reached', async () => {
    const h = buildHarness({ guardAnswer: false })
    const res = await h.service.startChallenge(1, 'user-1', false, '203.0.113.7')

    // The run is still created and playable; only ranking is off.
    assert.equal(h.created.length, 1)
    assert.equal(h.created[0]!.ipCapped, true)
    assert.equal(res.sharedConnectionCapped, true)
    assert.equal(res.tierSessionId, 'tier-1')
    await new Promise((r) => setImmediate(r))
    assert.equal(h.started[0]!.ipCapped, true)
  })

  it('never claims a slot for catch-up sessions', async () => {
    const h = buildHarness({ challengeDate: daysAgo(1), guardAnswer: false })
    const res = await h.service.startChallenge(1, 'user-1', true, '203.0.113.7')

    assert.equal(h.claims.length, 0)
    assert.equal(h.created[0]!.ipCapped, false)
    assert.equal(res.sharedConnectionCapped, false)
  })

  it('keeps the decision frozen on resume: no new claim, same flag', async () => {
    const ranked = buildHarness({ existing: { ip_capped: false }, guardAnswer: false })
    const r1 = await ranked.service.startChallenge(1, 'user-1', false, '198.51.100.4')
    assert.equal(ranked.claims.length, 0)
    assert.equal(r1.sharedConnectionCapped, false)

    const capped = buildHarness({ existing: { ip_capped: true }, guardAnswer: true })
    const r2 = await capped.service.startChallenge(1, 'user-1', false, '198.51.100.4')
    assert.equal(capped.claims.length, 0)
    assert.equal(r2.sharedConnectionCapped, true)
  })
})
