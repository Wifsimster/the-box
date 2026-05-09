import type { PushPayload } from '@the-box/types'
import { pushSubscriptionRepository } from '../../repositories/push-subscription.repository.js'
import {
  isPushConfigured,
  sendPush,
  type SendResult,
} from '../../push/push-sender.js'
import type { PushJobData } from '../queues.js'
import { queueLogger } from '../../logger/logger.js'

export interface FanOutResult {
  attempted: number
  succeeded: number
  pruned: number
  retryable: number
}

// Minimal subscription shape the fan-out needs. Decoupled from the full DB
// row so the unit tests don't have to fabricate every column.
export interface FanOutSubscription {
  endpoint: string
  user_id: string
  p256dh: string
  auth: string
}

// Ports for the fan-out worker. Concrete adapters wire these to the
// repository and web-push at the composition root in queues/workers.ts;
// tests pass fakes via `createFanOut(deps)`.
export interface FanOutDeps {
  isPushConfigured: () => boolean
  listActiveForUser: (userId: string) => Promise<FanOutSubscription[]>
  markSuccess: (endpoint: string, userId: string) => Promise<void>
  markFailure: (
    endpoint: string,
    userId: string,
    status: number,
    deactivate: boolean,
  ) => Promise<void>
  sendPush: (
    target: { endpoint: string; keys: { p256dh: string; auth: string } },
    payload: PushPayload,
  ) => Promise<SendResult>
  log?: { info: (...args: unknown[]) => void; warn: (...args: unknown[]) => void }
}

const defaultLog = queueLogger.child({ worker: 'push-fanout' })

const productionDeps: FanOutDeps = {
  isPushConfigured,
  listActiveForUser: (userId) => pushSubscriptionRepository.listActiveForUser(userId),
  markSuccess: (endpoint, userId) =>
    pushSubscriptionRepository.markSuccess(endpoint, userId),
  markFailure: (endpoint, userId, status, deactivate) =>
    pushSubscriptionRepository.markFailure(endpoint, userId, status, deactivate),
  sendPush,
  log: defaultLog,
}

// Per-user fan-out. Each device send is isolated with `Promise.allSettled`
// so one stuck provider doesn't poison the batch, and the result tells the
// BullMQ worker whether to fail (retry) or succeed.
export function createFanOut(deps: FanOutDeps = productionDeps) {
  const log = deps.log ?? { info: () => {}, warn: () => {} }

  return async function fanOutPush(data: PushJobData): Promise<FanOutResult> {
    if (!deps.isPushConfigured()) {
      log.warn(
        { userId: data.userId, type: data.payload.type },
        'push not configured; dropping job',
      )
      return { attempted: 0, succeeded: 0, pruned: 0, retryable: 0 }
    }

    const subs = await deps.listActiveForUser(data.userId)
    if (subs.length === 0) {
      return { attempted: 0, succeeded: 0, pruned: 0, retryable: 0 }
    }

    const outcomes = await Promise.allSettled(
      subs.map(async (sub) => {
        const result = await deps.sendPush(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          data.payload,
        )
        if (result.success) {
          await deps.markSuccess(sub.endpoint, sub.user_id)
          return { kind: 'success' as const }
        }
        await deps.markFailure(
          sub.endpoint,
          sub.user_id,
          result.statusCode ?? 0,
          result.gone,
        )
        if (result.gone) return { kind: 'pruned' as const }
        if (result.retryable) return { kind: 'retryable' as const }
        return { kind: 'permanent' as const }
      }),
    )

    let succeeded = 0
    let pruned = 0
    let retryable = 0
    for (const o of outcomes) {
      if (o.status !== 'fulfilled') {
        // The send branch threw before classifying (DB error in mark*).
        // Treat as retryable so BullMQ re-runs the job — it's idempotent.
        retryable += 1
        continue
      }
      if (o.value.kind === 'success') succeeded += 1
      else if (o.value.kind === 'pruned') pruned += 1
      else if (o.value.kind === 'retryable') retryable += 1
    }

    log.info(
      {
        userId: data.userId,
        type: data.payload.type,
        attempted: subs.length,
        succeeded,
        pruned,
        retryable,
      },
      'push fan-out complete',
    )

    return { attempted: subs.length, succeeded, pruned, retryable }
  }
}

// Default export wired with concrete adapters; the BullMQ worker calls this.
export const fanOutPush = createFanOut()
