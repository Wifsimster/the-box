import crypto from 'node:crypto'
import { webhookRepository, webhookDeliveryRepository } from '../../infrastructure/repositories/webhook.repository.js'
import { logger } from '../../infrastructure/logger/logger.js'
import type {
  PublicEventType,
  RankChangedEvent,
  SessionCompletedEvent,
  SessionStartedEvent,
  WebhookPayload,
} from '@the-box/types'

const log = logger.child({ service: 'webhook-dispatch' })

// Domain-level dispatch entry points. Routes and game-service hooks call
// these — they don't talk to the queue directly. Keeping enqueue logic
// behind a thin service means we can swap BullMQ for something else later
// without rewriting callers.

async function fanOut<T>(
  userId: string,
  slug: string,
  event: PublicEventType,
  eventIdSuffix: string,
  data: T,
): Promise<void> {
  const subs = await webhookRepository.findActiveByUserAndEvent(userId, event)
  if (subs.length === 0) return

  const occurredAt = new Date().toISOString()
  const eventId = `${event}:${eventIdSuffix}`
  const payload: WebhookPayload<T> = { eventId, event, occurredAt, slug, data }

  // Lazy import to keep this service test-friendly — the BullMQ queue
  // construction at module load time is heavy and pulls in Redis client.
  const { webhookQueue } = await import('../../infrastructure/queue/queues.js')

  for (const sub of subs) {
    const row = await webhookDeliveryRepository.enqueue({
      webhookId: sub.id,
      eventId,
      eventType: event,
      payload: payload as unknown as Record<string, unknown>,
    })
    if (!row) {
      // Duplicate enqueue (same webhook_id + event_id) — skip silently.
      // This is the documented idempotency contract.
      continue
    }
    await webhookQueue.add('deliver', { kind: 'deliver', deliveryId: row.id })
  }
  log.debug({ event, userId, subs: subs.length }, 'webhooks fanned out')
}

export const webhookDispatch = {
  async sessionStarted(params: {
    userId: string
    slug: string
    sessionId: string
    challengeDate: string
    countsForLeaderboard: boolean
  }): Promise<void> {
    const data: SessionStartedEvent = {
      sessionId: params.sessionId,
      challengeDate: params.challengeDate,
      countsForLeaderboard: params.countsForLeaderboard,
    }
    await fanOut(params.userId, params.slug, 'session.started', params.sessionId, data)
  },

  async sessionCompleted(params: {
    userId: string
    slug: string
    sessionId: string
    challengeDate: string
    score: number
    screenshotsFound: number
    totalScreenshots: number
    rank: number | null
    countsForLeaderboard: boolean
  }): Promise<void> {
    const data: SessionCompletedEvent = {
      score: params.score,
      screenshotsFound: params.screenshotsFound,
      totalScreenshots: params.totalScreenshots,
      rank: params.rank,
      challengeDate: params.challengeDate,
      countsForLeaderboard: params.countsForLeaderboard,
    }
    await fanOut(params.userId, params.slug, 'session.completed', params.sessionId, data)
  },

  /**
   * Fires for the player who just finished a ranked session — a rank-only
   * companion to session.completed. The event id reuses the session id so a
   * re-run can't double-deliver. Callers must only invoke this for
   * non-catch-up sessions with a resolved rank.
   */
  async rankChanged(params: {
    userId: string
    slug: string
    sessionId: string
    challengeDate: string
    rank: number
  }): Promise<void> {
    const data: RankChangedEvent = {
      rank: params.rank,
      challengeDate: params.challengeDate,
    }
    await fanOut(params.userId, params.slug, 'rank.changed', params.sessionId, data)
  },
}

// Stable hash of a payload — used by the SSE channel to skip "no-change"
// frames without keeping a full diff of the previous emit.
export function hashPayload(value: unknown): string {
  return crypto.createHash('sha1').update(JSON.stringify(value)).digest('hex').slice(0, 16)
}
