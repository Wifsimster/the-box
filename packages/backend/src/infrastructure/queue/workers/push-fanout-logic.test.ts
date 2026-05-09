import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  createFanOut,
  type FanOutDeps,
  type FanOutSubscription,
} from './push-fanout-logic.js'
import type { PushJobData } from '../queues.js'
import type { SendResult } from '../../push/push-sender.js'

// ---- Fakes -----------------------------------------------------------------

type SendBehavior = SendResult | (() => SendResult | Promise<SendResult>)

interface FakeState {
  configured: boolean
  subs: FanOutSubscription[]
  // Map of endpoint → SendResult (or a thunk for async / dynamic results).
  sendBehavior: Map<string, SendBehavior>
  // Optional per-endpoint markFailure error injection.
  markFailureShouldThrow: Set<string>
  successes: string[]
  failures: Array<{ endpoint: string; userId: string; status: number; deactivate: boolean }>
}

function makeDeps(state: FakeState): FanOutDeps {
  return {
    isPushConfigured: () => state.configured,
    listActiveForUser: async () => state.subs,
    markSuccess: async (endpoint, _userId) => {
      state.successes.push(endpoint)
    },
    markFailure: async (endpoint, userId, status, deactivate) => {
      if (state.markFailureShouldThrow.has(endpoint)) {
        throw new Error('synthetic mark failure error')
      }
      state.failures.push({ endpoint, userId, status, deactivate })
    },
    sendPush: async (target) => {
      const behavior = state.sendBehavior.get(target.endpoint)
      if (!behavior) {
        return { success: true, statusCode: 201, gone: false, retryable: false }
      }
      if (typeof behavior === 'function') return behavior()
      return behavior
    },
    log: { info: () => {}, warn: () => {} },
  }
}

const PAYLOAD: PushJobData = {
  kind: 'send-to-user',
  userId: 'user-1',
  payload: { type: 'daily_challenge_ready', title: 'hi', body: 'go' },
}

function sub(n: number): FanOutSubscription {
  return {
    endpoint: `https://fcm.googleapis.com/fcm/send/token-${n}`,
    user_id: 'user-1',
    p256dh: `p256dh-${n}`,
    auth: `auth-${n}`,
  }
}

function freshState(overrides: Partial<FakeState> = {}): FakeState {
  return {
    configured: true,
    subs: [],
    sendBehavior: new Map(),
    markFailureShouldThrow: new Set(),
    successes: [],
    failures: [],
    ...overrides,
  }
}

// ---- Tests -----------------------------------------------------------------

describe('createFanOut', () => {
  it('short-circuits when push is not configured', async () => {
    const state = freshState({ configured: false, subs: [sub(1)] })
    const fanOut = createFanOut(makeDeps(state))
    const result = await fanOut(PAYLOAD)
    assert.deepEqual(result, { attempted: 0, succeeded: 0, pruned: 0, retryable: 0 })
    assert.equal(state.successes.length, 0)
    assert.equal(state.failures.length, 0)
  })

  it('returns zeros when the user has no active subscriptions', async () => {
    const state = freshState({ subs: [] })
    const fanOut = createFanOut(makeDeps(state))
    const result = await fanOut(PAYLOAD)
    assert.deepEqual(result, { attempted: 0, succeeded: 0, pruned: 0, retryable: 0 })
  })

  it('counts a single success and calls markSuccess scoped by user_id', async () => {
    const state = freshState({ subs: [sub(1)] })
    state.sendBehavior.set(sub(1).endpoint, {
      success: true,
      statusCode: 201,
      gone: false,
      retryable: false,
    })
    const fanOut = createFanOut(makeDeps(state))
    const result = await fanOut(PAYLOAD)
    assert.equal(result.attempted, 1)
    assert.equal(result.succeeded, 1)
    assert.equal(result.pruned, 0)
    assert.equal(result.retryable, 0)
    assert.deepEqual(state.successes, [sub(1).endpoint])
  })

  it('classifies a 410 as pruned and forwards deactivate=true to markFailure', async () => {
    const state = freshState({ subs: [sub(1)] })
    state.sendBehavior.set(sub(1).endpoint, {
      success: false,
      statusCode: 410,
      gone: true,
      retryable: false,
    })
    const fanOut = createFanOut(makeDeps(state))
    const result = await fanOut(PAYLOAD)
    assert.equal(result.pruned, 1)
    assert.equal(result.succeeded, 0)
    assert.equal(result.retryable, 0)
    assert.deepEqual(state.failures, [
      { endpoint: sub(1).endpoint, userId: 'user-1', status: 410, deactivate: true },
    ])
  })

  it('classifies a 500 as retryable and does NOT deactivate', async () => {
    const state = freshState({ subs: [sub(1)] })
    state.sendBehavior.set(sub(1).endpoint, {
      success: false,
      statusCode: 500,
      gone: false,
      retryable: true,
    })
    const fanOut = createFanOut(makeDeps(state))
    const result = await fanOut(PAYLOAD)
    assert.equal(result.retryable, 1)
    assert.equal(result.pruned, 0)
    assert.equal(state.failures[0]?.deactivate, false)
  })

  it('classifies a 400 as permanent (not retryable, not pruned)', async () => {
    const state = freshState({ subs: [sub(1)] })
    state.sendBehavior.set(sub(1).endpoint, {
      success: false,
      statusCode: 400,
      gone: false,
      retryable: false,
    })
    const fanOut = createFanOut(makeDeps(state))
    const result = await fanOut(PAYLOAD)
    assert.equal(result.retryable, 0)
    assert.equal(result.pruned, 0)
    assert.equal(result.succeeded, 0)
    assert.equal(state.failures.length, 1)
  })

  it('isolates per-device failures with Promise.allSettled (one slow device does not poison the batch)', async () => {
    const state = freshState({ subs: [sub(1), sub(2), sub(3)] })
    state.sendBehavior.set(sub(1).endpoint, {
      success: true,
      statusCode: 201,
      gone: false,
      retryable: false,
    })
    state.sendBehavior.set(sub(2).endpoint, {
      success: false,
      statusCode: 410,
      gone: true,
      retryable: false,
    })
    state.sendBehavior.set(sub(3).endpoint, {
      success: true,
      statusCode: 201,
      gone: false,
      retryable: false,
    })
    const fanOut = createFanOut(makeDeps(state))
    const result = await fanOut(PAYLOAD)
    assert.equal(result.attempted, 3)
    assert.equal(result.succeeded, 2)
    assert.equal(result.pruned, 1)
    assert.equal(result.retryable, 0)
  })

  it('treats a thrown markFailure as retryable (idempotent retry on DB blip)', async () => {
    const state = freshState({ subs: [sub(1)] })
    state.sendBehavior.set(sub(1).endpoint, {
      success: false,
      statusCode: 500,
      gone: false,
      retryable: true,
    })
    state.markFailureShouldThrow.add(sub(1).endpoint)
    const fanOut = createFanOut(makeDeps(state))
    const result = await fanOut(PAYLOAD)
    assert.equal(result.retryable, 1)
    assert.equal(result.succeeded, 0)
  })

  it('mixes success + retryable + pruned + permanent across many devices in one fan-out', async () => {
    const state = freshState({ subs: [sub(1), sub(2), sub(3), sub(4)] })
    state.sendBehavior.set(sub(1).endpoint, { success: true, statusCode: 201, gone: false, retryable: false })
    state.sendBehavior.set(sub(2).endpoint, { success: false, statusCode: 503, gone: false, retryable: true })
    state.sendBehavior.set(sub(3).endpoint, { success: false, statusCode: 410, gone: true, retryable: false })
    state.sendBehavior.set(sub(4).endpoint, { success: false, statusCode: 400, gone: false, retryable: false })
    const fanOut = createFanOut(makeDeps(state))
    const result = await fanOut(PAYLOAD)
    assert.equal(result.attempted, 4)
    assert.equal(result.succeeded, 1)
    assert.equal(result.retryable, 1)
    assert.equal(result.pruned, 1)
    // permanent is not surfaced in the result counters but markFailure was still called for it
    assert.equal(state.failures.length, 3)
  })
})
