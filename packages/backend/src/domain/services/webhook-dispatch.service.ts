import crypto from 'node:crypto'
import type {
  DomainLogger,
  WebhookRepository,
  WebhookDeliveryRepository,
} from '../ports/index.js'
import type {
  PublicEventType,
  RankChangedEvent,
  SessionCompletedEvent,
  SessionStartedEvent,
  WebhookPayload,
} from '@the-box/types'

export interface WebhookDispatchDeps {
  logger: DomainLogger
  webhookRepository: WebhookRepository
  webhookDeliveryRepository: WebhookDeliveryRepository
  enqueueDelivery: (deliveryId: number) => Promise<void>
}

export interface WebhookDispatchService {
  sessionStarted(params: {
    userId: string
    slug: string
    sessionId: string
    challengeDate: string
    countsForLeaderboard: boolean
  }): Promise<void>
  sessionCompleted(params: {
    userId: string
    slug: string
    sessionId: string
    challengeDate: string
    score: number
    screenshotsFound: number
    totalScreenshots: number
    rank: number | null
    countsForLeaderboard: boolean
  }): Promise<void>
  rankChanged(params: {
    userId: string
    slug: string
    sessionId: string
    challengeDate: string
    rank: number
  }): Promise<void>
}

export function createWebhookDispatchService(
  deps: WebhookDispatchDeps,
): WebhookDispatchService {
  const log = deps.logger.child({ service: 'webhook-dispatch' })

  async function fanOut<T>(
    userId: string,
    slug: string,
    event: PublicEventType,
    eventIdSuffix: string,
    data: T,
  ): Promise<void> {
    const subs = await deps.webhookRepository.findActiveByUserAndEvent(userId, event)
    if (subs.length === 0) return

    const occurredAt = new Date().toISOString()
    const eventId = `${event}:${eventIdSuffix}`
    const payload: WebhookPayload<T> = { eventId, event, occurredAt, slug, data }

    for (const sub of subs) {
      const row = await deps.webhookDeliveryRepository.enqueue({
        webhookId: sub.id,
        eventId,
        eventType: event,
        payload: payload as unknown as Record<string, unknown>,
      })
      if (!row) {
        continue
      }
      await deps.enqueueDelivery(row.id)
    }
    log.debug({ event, userId, subs: subs.length }, 'webhooks fanned out')
  }

  return {
    async sessionStarted(params): Promise<void> {
      const data: SessionStartedEvent = {
        sessionId: params.sessionId,
        challengeDate: params.challengeDate,
        countsForLeaderboard: params.countsForLeaderboard,
      }
      await fanOut(params.userId, params.slug, 'session.started', params.sessionId, data)
    },

    async sessionCompleted(params): Promise<void> {
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

    async rankChanged(params): Promise<void> {
      const data: RankChangedEvent = {
        rank: params.rank,
        challengeDate: params.challengeDate,
      }
      await fanOut(params.userId, params.slug, 'rank.changed', params.sessionId, data)
    },
  }
}

export function hashPayload(value: unknown): string {
  return crypto.createHash('sha1').update(JSON.stringify(value)).digest('hex').slice(0, 16)
}
