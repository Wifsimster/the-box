import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import type { PushPayload } from '@the-box/types'
import { createPushService, type PushServiceDeps } from './push.service.js'

interface FakeState {
  configured: boolean
  enqueueCalls: Array<{ userId: string; payload: PushPayload }>
  enqueueShouldThrow: boolean
  enqueueResultId?: string
  warnings: Array<{ obj: unknown; msg: string }>
  infos: Array<{ obj: unknown; msg: string }>
}

function makeDeps(state: FakeState): PushServiceDeps {
  return {
    isConfigured: () => state.configured,
    async enqueueSendToUser(userId, payload) {
      state.enqueueCalls.push({ userId, payload })
      if (state.enqueueShouldThrow) throw new Error('synthetic enqueue failure')
      return { id: state.enqueueResultId ?? 'job-123' }
    },
    log: {
      info: (obj: unknown, msg: unknown) =>
        state.infos.push({ obj, msg: String(msg) }),
      warn: (obj: unknown, msg: unknown) =>
        state.warnings.push({ obj, msg: String(msg) }),
    },
  }
}

const PAYLOAD: PushPayload = {
  type: 'daily_challenge_ready',
  title: 'New challenge',
  body: 'Your daily Box is ready.',
}

function freshState(overrides: Partial<FakeState> = {}): FakeState {
  return {
    configured: true,
    enqueueCalls: [],
    enqueueShouldThrow: false,
    warnings: [],
    infos: [],
    ...overrides,
  }
}

describe('pushService.sendToUser', () => {
  it('enqueues a send-to-user job and returns the job id when configured', async () => {
    const state = freshState({ enqueueResultId: 'abc-1' })
    const service = createPushService(makeDeps(state))
    const result = await service.sendToUser('user-1', PAYLOAD)
    assert.deepEqual(result, { enqueued: true, jobId: 'abc-1' })
    assert.equal(state.enqueueCalls.length, 1)
    assert.deepEqual(state.enqueueCalls[0], { userId: 'user-1', payload: PAYLOAD })
  })

  it('forwards the user id and the full payload (type, title, body, url, data)', async () => {
    const state = freshState()
    const service = createPushService(makeDeps(state))
    const richPayload: PushPayload = {
      ...PAYLOAD,
      url: '/play',
      data: { challengeId: 42, locale: 'fr' },
    }
    await service.sendToUser('user-7', richPayload)
    assert.deepEqual(state.enqueueCalls[0]?.payload, richPayload)
    assert.equal(state.enqueueCalls[0]?.userId, 'user-7')
  })

  it('short-circuits with enqueued: false when isConfigured is false (no enqueue)', async () => {
    const state = freshState({ configured: false })
    const service = createPushService(makeDeps(state))
    const result = await service.sendToUser('user-1', PAYLOAD)
    assert.deepEqual(result, { enqueued: false })
    assert.equal(state.enqueueCalls.length, 0)
    // And it logs a warning so an operator can see the "feature off" path.
    assert.equal(state.warnings.length, 1)
  })

  it('does not catch enqueue errors — they bubble up to the caller', async () => {
    const state = freshState({ enqueueShouldThrow: true })
    const service = createPushService(makeDeps(state))
    await assert.rejects(
      () => service.sendToUser('user-1', PAYLOAD),
      /synthetic enqueue failure/,
    )
  })

  it('returns enqueued: true even when the queue assigns no id (BullMQ optional id)', async () => {
    // Inline the fake: the helper defaults to 'job-123' to keep the other
    // tests terse, but here we deliberately want the dep to return no id.
    const service = createPushService({
      isConfigured: () => true,
      enqueueSendToUser: async () => ({}),
      log: { info: () => {}, warn: () => {} },
    })
    const result = await service.sendToUser('user-1', PAYLOAD)
    assert.equal(result.enqueued, true)
    assert.equal(result.jobId, undefined)
  })

  it('isConfigured exposes the dep predicate so callers can probe without enqueueing', async () => {
    const state = freshState({ configured: false })
    const service = createPushService(makeDeps(state))
    assert.equal(service.isConfigured(), false)
    state.configured = true
    assert.equal(service.isConfigured(), true)
  })
})
