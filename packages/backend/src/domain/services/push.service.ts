import type { PushPayload } from '@the-box/types'

export type { PushPayload } from '@the-box/types'

export interface SendToUserResult {
  enqueued: boolean
  jobId?: string
}

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
