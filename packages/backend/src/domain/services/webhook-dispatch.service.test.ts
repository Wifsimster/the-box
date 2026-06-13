import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  createWebhookDispatchService,
  hashPayload,
  type WebhookDispatchService,
} from './webhook-dispatch.service.js'
import type {
  WebhookSubscriptionRecord,
  WebhookDeliveryRecord,
} from '../ports/index.js'
import type { PublicEventType } from '@the-box/types'

const noopLogger = {
  info() {},
  warn() {},
  error() {},
  debug() {},
  fatal() {},
  trace() {},
  child() {
    return noopLogger
  },
}

interface EnqueuedDelivery {
  webhookId: number
  eventId: string
  eventType: PublicEventType
  payload: Record<string, unknown>
}

function makeService(opts: {
  subs?: WebhookSubscriptionRecord[]
  // ids that should be treated as duplicates (enqueue returns null)
  duplicateWebhookIds?: number[]
}) {
  const enqueued: EnqueuedDelivery[] = []
  const dispatchedDeliveryIds: number[] = []
  let deliveryId = 0

  const service: WebhookDispatchService = createWebhookDispatchService({
    logger: noopLogger,
    webhookRepository: {
      async findActiveByUserAndEvent() {
        return opts.subs ?? []
      },
    },
    webhookDeliveryRepository: {
      async enqueue(params): Promise<WebhookDeliveryRecord | null> {
        if (opts.duplicateWebhookIds?.includes(params.webhookId)) return null
        enqueued.push(params)
        return { id: ++deliveryId }
      },
    },
    enqueueDelivery: async (id) => {
      dispatchedDeliveryIds.push(id)
    },
  })

  return { service, enqueued, dispatchedDeliveryIds }
}

describe('webhook-dispatch.service', () => {
  it('does nothing when there are no active subscriptions', async () => {
    const { service, enqueued, dispatchedDeliveryIds } = makeService({ subs: [] })
    await service.sessionCompleted({
      userId: 'u1',
      slug: 'streamer',
      sessionId: 's1',
      challengeDate: '2026-06-13',
      score: 100,
      screenshotsFound: 8,
      totalScreenshots: 10,
      rank: 3,
      countsForLeaderboard: true,
    })
    assert.equal(enqueued.length, 0)
    assert.equal(dispatchedDeliveryIds.length, 0)
  })

  it('fans out one delivery per active subscription and queues each row', async () => {
    const { service, enqueued, dispatchedDeliveryIds } = makeService({
      subs: [{ id: 11 }, { id: 22 }],
    })
    await service.sessionStarted({
      userId: 'u1',
      slug: 'streamer',
      sessionId: 's1',
      challengeDate: '2026-06-13',
      countsForLeaderboard: true,
    })
    assert.equal(enqueued.length, 2)
    assert.deepEqual(
      enqueued.map((e) => e.webhookId),
      [11, 22],
    )
    // eventId reuses the session id so a re-run can't double-deliver.
    assert.ok(enqueued.every((e) => e.eventId === 'session.started:s1'))
    assert.ok(enqueued.every((e) => e.eventType === 'session.started'))
    // every persisted delivery row id is handed to the delivery queue.
    assert.deepEqual(dispatchedDeliveryIds, [1, 2])
  })

  it('skips the delivery queue for duplicate (idempotent) enqueues', async () => {
    const { service, enqueued, dispatchedDeliveryIds } = makeService({
      subs: [{ id: 11 }, { id: 22 }],
      duplicateWebhookIds: [11],
    })
    await service.rankChanged({
      userId: 'u1',
      slug: 'streamer',
      sessionId: 's1',
      challengeDate: '2026-06-13',
      rank: 1,
    })
    // sub 11 was a duplicate → no row, not queued; sub 22 proceeds.
    assert.deepEqual(
      enqueued.map((e) => e.webhookId),
      [22],
    )
    assert.deepEqual(dispatchedDeliveryIds, [1])
  })
})

describe('hashPayload', () => {
  it('is stable for equal values and differs for different values', () => {
    assert.equal(hashPayload({ a: 1, b: 2 }), hashPayload({ a: 1, b: 2 }))
    assert.notEqual(hashPayload({ a: 1 }), hashPayload({ a: 2 }))
  })
})
