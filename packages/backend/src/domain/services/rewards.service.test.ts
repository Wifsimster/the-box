import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { createRewardsService, RewardsError } from './rewards.service.js'
import type { RewardGrant, RewardGrantPayload } from '@the-box/types'
import type { RewardRepository } from '../ports/repositories.js'
import type { DomainLogger } from '../ports/logger.js'

// Silent logger that satisfies the port without spamming test output.
const silentLogger: DomainLogger = {
  child: () => silentLogger,
  trace: () => {},
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
  fatal: () => {},
}

interface FakeRepoState {
  grantAtomicCalls: Array<Parameters<RewardRepository['grantAtomic']>[0]>
  markUnlockedCalls: Array<{ id: string; userId: string }>
  markClaimedCalls: Array<{ id: string; userId: string }>
  listForUserCalls: Array<{ userId: string; options?: Parameters<RewardRepository['listForUser']>[1] }>
}

function makeFakeRepo(
  overrides: Partial<RewardRepository> = {}
): { repo: RewardRepository; state: FakeRepoState } {
  const state: FakeRepoState = {
    grantAtomicCalls: [],
    markUnlockedCalls: [],
    markClaimedCalls: [],
    listForUserCalls: [],
  }

  const fakeGrant = (input: Parameters<RewardRepository['grantAtomic']>[0]): RewardGrant => ({
    id: 'fake-uuid-1',
    userId: input.userId,
    source: input.source as RewardGrant['source'],
    sourceRef: input.sourceRef,
    payload: input.payload,
    grantedAt: '2026-05-03T12:00:00.000Z',
    unlockedAt: input.autoUnlock ? '2026-05-03T12:00:00.000Z' : null,
    claimedAt: null,
  })

  const repo: RewardRepository = {
    async grantAtomic(input) {
      state.grantAtomicCalls.push(input)
      return { wasNew: true, grant: fakeGrant(input) }
    },
    async findById() {
      return null
    },
    async markUnlocked(id, userId) {
      state.markUnlockedCalls.push({ id, userId })
      return null
    },
    async markClaimed(id, userId) {
      state.markClaimedCalls.push({ id, userId })
      return null
    },
    async unlockPendingByUserAndSource() {
      return []
    },
    async listForUser(userId, options) {
      state.listForUserCalls.push({ userId, options })
      return []
    },
    ...overrides,
  }

  return { repo, state }
}

describe('rewardsService.grant', () => {
  it('forwards a valid milestone grant and reports wasNew=true', async () => {
    const { repo, state } = makeFakeRepo()
    const service = createRewardsService({ logger: silentLogger, rewardRepository: repo })

    const result = await service.grant({
      userId: 'user-1',
      source: 'milestone',
      sourceRef: 'milestone:games_played_100',
      items: [{ itemType: 'powerup', itemKey: 'hint_letter', quantity: 1 }],
    })

    assert.equal(result.wasNew, true)
    assert.equal(state.grantAtomicCalls.length, 1)
    const call = state.grantAtomicCalls[0]
    assert.ok(call, 'expected one grantAtomic call')
    assert.equal(call.source, 'milestone')
    assert.equal(call.sourceRef, 'milestone:games_played_100')
    assert.deepEqual(call.payload.items, [
      { itemType: 'powerup', itemKey: 'hint_letter', quantity: 1 },
    ])
    // milestone is in the auto-unlock set
    assert.equal(call.autoUnlock, true)
    assert.equal(result.grant.unlockedAt, '2026-05-03T12:00:00.000Z')
  })

  it('reports wasNew=false on idempotent retry without throwing', async () => {
    const { repo, state } = makeFakeRepo({
      async grantAtomic(input) {
        state.grantAtomicCalls.push(input)
        return {
          wasNew: false,
          grant: {
            id: 'fake-uuid-1',
            userId: input.userId,
            source: input.source as RewardGrant['source'],
            sourceRef: input.sourceRef,
            payload: input.payload,
            grantedAt: '2026-05-03T12:00:00.000Z',
            unlockedAt: '2026-05-03T12:00:00.000Z',
            claimedAt: null,
          },
        }
      },
    })
    const service = createRewardsService({ logger: silentLogger, rewardRepository: repo })

    const result = await service.grant({
      userId: 'user-1',
      source: 'streak_freeze',
      sourceRef: 'streak_freeze:2026-05',
      items: [{ itemType: 'powerup', itemKey: 'streak_freeze', quantity: 1 }],
    })

    assert.equal(result.wasNew, false)
    assert.equal(state.grantAtomicCalls.length, 1)
  })

  it('does not auto-unlock reactivation grants (must be earned through play)', async () => {
    const { repo, state } = makeFakeRepo()
    const service = createRewardsService({ logger: silentLogger, rewardRepository: repo })

    await service.grant({
      userId: 'user-1',
      source: 'reactivation',
      sourceRef: 'reactivation:2026-w18',
      items: [{ itemType: 'powerup', itemKey: 'hint_letter', quantity: 1 }],
    })

    const call = state.grantAtomicCalls[0]
    assert.ok(call)
    assert.equal(call.autoUnlock, false)
  })

  it('respects an explicit autoUnlock override', async () => {
    const { repo, state } = makeFakeRepo()
    const service = createRewardsService({ logger: silentLogger, rewardRepository: repo })

    await service.grant({
      userId: 'user-1',
      source: 'reactivation',
      sourceRef: 'reactivation:2026-w18',
      items: [{ itemType: 'powerup', itemKey: 'hint_letter', quantity: 1 }],
      autoUnlock: true,
    })

    const call = state.grantAtomicCalls[0]
    assert.ok(call)
    assert.equal(call.autoUnlock, true)
  })

  it('rejects an unknown source', async () => {
    const { repo } = makeFakeRepo()
    const service = createRewardsService({ logger: silentLogger, rewardRepository: repo })

    await assert.rejects(
      service.grant({
        userId: 'user-1',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        source: 'bogus_source' as any,
        sourceRef: 'bogus:1',
        items: [{ itemType: 'powerup', itemKey: 'x', quantity: 1 }],
      }),
      (err: unknown) => err instanceof RewardsError && err.code === 'UNKNOWN_SOURCE'
    )
  })

  it('rejects empty items', async () => {
    const { repo } = makeFakeRepo()
    const service = createRewardsService({ logger: silentLogger, rewardRepository: repo })

    await assert.rejects(
      service.grant({
        userId: 'user-1',
        source: 'milestone',
        sourceRef: 'milestone:foo',
        items: [],
      }),
      (err: unknown) => err instanceof RewardsError && err.code === 'EMPTY_PAYLOAD'
    )
  })

  it('rejects non-positive quantities', async () => {
    const { repo } = makeFakeRepo()
    const service = createRewardsService({ logger: silentLogger, rewardRepository: repo })

    await assert.rejects(
      service.grant({
        userId: 'user-1',
        source: 'milestone',
        sourceRef: 'milestone:foo',
        items: [{ itemType: 'powerup', itemKey: 'x', quantity: 0 }],
      }),
      (err: unknown) => err instanceof RewardsError && err.code === 'INVALID_QUANTITY'
    )

    await assert.rejects(
      service.grant({
        userId: 'user-1',
        source: 'milestone',
        sourceRef: 'milestone:foo',
        items: [{ itemType: 'powerup', itemKey: 'x', quantity: -1 }],
      }),
      (err: unknown) => err instanceof RewardsError && err.code === 'INVALID_QUANTITY'
    )

    await assert.rejects(
      service.grant({
        userId: 'user-1',
        source: 'milestone',
        sourceRef: 'milestone:foo',
        items: [{ itemType: 'powerup', itemKey: 'x', quantity: 1.5 }],
      }),
      (err: unknown) => err instanceof RewardsError && err.code === 'INVALID_QUANTITY'
    )
  })

  it('rejects items missing itemType or itemKey', async () => {
    const { repo } = makeFakeRepo()
    const service = createRewardsService({ logger: silentLogger, rewardRepository: repo })

    await assert.rejects(
      service.grant({
        userId: 'user-1',
        source: 'milestone',
        sourceRef: 'milestone:foo',
        items: [{ itemType: '', itemKey: 'x', quantity: 1 }],
      }),
      (err: unknown) => err instanceof RewardsError && err.code === 'INVALID_ITEM'
    )
  })

  it('rejects malformed sourceRef strings', async () => {
    const { repo } = makeFakeRepo()
    const service = createRewardsService({ logger: silentLogger, rewardRepository: repo })

    for (const bad of ['', 'BAD', 'with space', 'has/slash', '-leading', 'trailing-']) {
      await assert.rejects(
        service.grant({
          userId: 'user-1',
          source: 'milestone',
          sourceRef: bad,
          items: [{ itemType: 'powerup', itemKey: 'x', quantity: 1 }],
        }),
        (err: unknown) => err instanceof RewardsError && err.code === 'INVALID_SOURCE_REF',
        `expected sourceRef "${bad}" to be rejected`
      )
    }
  })

  it('accepts canonical sourceRef shapes used by each stream', async () => {
    const { repo } = makeFakeRepo()
    const service = createRewardsService({ logger: silentLogger, rewardRepository: repo })

    const valid = [
      'reactivation:2026-w18',
      'milestone:games_played_100',
      'streak_freeze:2026-05',
      'leaderboard_payout:monthly:2026-04',
      'cosmetic_unlock:frame_neon_purple',
      'powerup_drop:daily_login_day_3',
    ]

    for (const ref of valid) {
      const items: RewardGrantPayload['items'] = [
        { itemType: 'powerup', itemKey: 'x', quantity: 1 },
      ]
      // Use a source that matches the prefix when applicable; the service
      // does not enforce source/sourceRef cross-validation.
      await service.grant({
        userId: 'user-1',
        source: 'milestone',
        sourceRef: ref,
        items,
      })
    }
  })
})

describe('rewardsService.unlock / claim / listUnclaimed', () => {
  it('unlock delegates to repository.markUnlocked', async () => {
    const { repo, state } = makeFakeRepo()
    const service = createRewardsService({ logger: silentLogger, rewardRepository: repo })

    await service.unlock('grant-1', 'user-1')
    assert.deepEqual(state.markUnlockedCalls, [{ id: 'grant-1', userId: 'user-1' }])
  })

  it('claim delegates to repository.markClaimed', async () => {
    const { repo, state } = makeFakeRepo()
    const service = createRewardsService({ logger: silentLogger, rewardRepository: repo })

    await service.claim('grant-1', 'user-1')
    assert.deepEqual(state.markClaimedCalls, [{ id: 'grant-1', userId: 'user-1' }])
  })

  it('listUnclaimed delegates with onlyUnclaimed=true', async () => {
    const { repo, state } = makeFakeRepo()
    const service = createRewardsService({ logger: silentLogger, rewardRepository: repo })

    await service.listUnclaimed('user-1', 25)
    assert.equal(state.listForUserCalls.length, 1)
    const call = state.listForUserCalls[0]
    assert.ok(call)
    assert.equal(call.userId, 'user-1')
    assert.deepEqual(call.options, { onlyUnclaimed: true, limit: 25 })
  })
})
