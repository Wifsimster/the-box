import { pushSubscriptionRepository } from '../../repositories/push-subscription.repository.js'
import { sendPush, isPushConfigured } from '../../push/push-sender.js'
import type { PushJobData } from '../queues.js'
import { queueLogger } from '../../logger/logger.js'

const log = queueLogger.child({ worker: 'push-fanout' })

export interface FanOutResult {
  attempted: number
  succeeded: number
  pruned: number
  retryable: number
}

// Per-user fan-out. Each device send is isolated with `Promise.allSettled`
// so one stuck provider doesn't poison the batch, and the result tells the
// BullMQ worker whether to fail (retry) or succeed.
export async function fanOutPush(data: PushJobData): Promise<FanOutResult> {
  if (!isPushConfigured()) {
    log.warn({ userId: data.userId, type: data.payload.type }, 'push not configured; dropping job')
    return { attempted: 0, succeeded: 0, pruned: 0, retryable: 0 }
  }

  const subs = await pushSubscriptionRepository.listActiveForUser(data.userId)
  if (subs.length === 0) {
    return { attempted: 0, succeeded: 0, pruned: 0, retryable: 0 }
  }

  const outcomes = await Promise.allSettled(
    subs.map(async (sub) => {
      const result = await sendPush(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        data.payload,
      )
      if (result.success) {
        await pushSubscriptionRepository.markSuccess(sub.endpoint, sub.user_id)
        return { kind: 'success' as const }
      }
      await pushSubscriptionRepository.markFailure(
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
      // The send branch threw before classifying (DB error in mark*). Treat
      // as retryable so BullMQ re-runs the job — it's idempotent.
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
