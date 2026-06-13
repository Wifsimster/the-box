import type { PushPayload } from '@the-box/types'

// Re-export the wire type so existing imports (`import { PushPayload } from
// '../../domain/services/push.service.js'`) keep compiling. New code should
// import directly from '@the-box/types'.
export type { PushPayload } from '@the-box/types'

export interface SendToUserResult {
  enqueued: boolean
  jobId?: string
}

// Ports the service depends on. The composition root binds them to the
// concrete BullMQ queue + push-sender; tests pass fakes via
// `createPushService(deps)`. Keeps the service file free of infrastructure
// imports — it stays a pure domain unit.
export interface PushServiceDeps {
  isConfigured: () => boolean
  enqueueSendToUser: (userId: string, payload: PushPayload) => Promise<{ id?: string }>
  log?: { info: (...args: unknown[]) => void; warn: (...args: unknown[]) => void }
}

export interface PushService {
  isConfigured: () => boolean
  sendToUser(userId: string, payload: PushPayload): Promise<SendToUserResult>
}

export function createPushService(deps: PushServiceDeps): PushService {
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
