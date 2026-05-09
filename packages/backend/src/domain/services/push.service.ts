import type { PushPayload } from '@the-box/types'
import { isPushConfigured } from '../../infrastructure/push/push-sender.js'
import { serviceLogger } from '../../infrastructure/logger/logger.js'

// Lazy import: pulling queues.js at module load constructs a BullMQ Queue
// and opens a Redis connection, which keeps the event loop alive forever
// in unit tests that import this module. Importing inside the production
// dep means tests using `createPushService(fakeDeps)` never trigger it.
async function enqueueViaQueue(
  userId: string,
  payload: PushPayload,
): Promise<{ id?: string }> {
  const { pushQueue } = await import('../../infrastructure/queue/queues.js')
  const job = await pushQueue.add('send-to-user', {
    kind: 'send-to-user',
    userId,
    payload,
  })
  return { id: job.id }
}

// Re-export the wire type so existing imports (`import { PushPayload } from
// '../../domain/services/push.service.js'`) keep compiling. New code should
// import directly from '@the-box/types'.
export type { PushPayload } from '@the-box/types'

export interface SendToUserResult {
  enqueued: boolean
  jobId?: string
}

// Ports the service depends on. The default factory binds them to the
// concrete BullMQ queue + push-sender; tests pass fakes via
// `createPushService(deps)`. Keeps the service free of import cycles
// against infrastructure for the parts that are interesting to test.
export interface PushServiceDeps {
  isConfigured: () => boolean
  enqueueSendToUser: (userId: string, payload: PushPayload) => Promise<{ id?: string }>
  log?: { info: (...args: unknown[]) => void; warn: (...args: unknown[]) => void }
}

const defaultLog = serviceLogger.child({ service: 'push' })

const productionDeps: PushServiceDeps = {
  isConfigured: isPushConfigured,
  enqueueSendToUser: enqueueViaQueue,
  log: defaultLog,
}

export function createPushService(deps: PushServiceDeps = productionDeps) {
  const log = deps.log ?? { info: () => {}, warn: () => {} }

  return {
    isConfigured: deps.isConfigured,

    // Enqueue a push fan-out job. The actual per-device fan-out (with
    // timeout, allSettled, retry, and 410-deactivation) runs inside
    // push.worker.ts so the request thread isn't sitting on N round-trips
    // to FCM. Callers get a synchronous "accepted" response — delivery is
    // best-effort and observable via the BullMQ dashboards.
    async sendToUser(userId: string, payload: PushPayload): Promise<SendToUserResult> {
      if (!deps.isConfigured()) {
        log.warn({ userId, type: payload.type }, 'push not configured; skipping enqueue')
        return { enqueued: false }
      }
      const { id } = await deps.enqueueSendToUser(userId, payload)
      return { enqueued: true, jobId: id }
    },
  }
}

// Default singleton wired with concrete adapters. Routes and other domain
// services use this; tests build their own via `createPushService(...)`.
export const pushService = createPushService()
