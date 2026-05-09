import { isPushConfigured } from '../../infrastructure/push/push-sender.js'
import { pushQueue } from '../../infrastructure/queue/queues.js'
import { serviceLogger } from '../../infrastructure/logger/logger.js'

const log = serviceLogger.child({ service: 'push' })

export interface PushPayload {
  // Free-form discriminator the SW will use to decide how to render. Examples:
  //   'daily_challenge_ready'
  //   'streak_at_risk'
  //   'leaderboard_position_lost'
  type: string
  title: string
  body: string
  // Optional URL the SW should open when the user clicks the notification.
  // Relative paths are resolved against the manifest scope.
  url?: string
  // Arbitrary extra data forwarded to the SW for type-specific handling.
  data?: Record<string, unknown>
}

export interface SendToUserResult {
  enqueued: boolean
  jobId?: string
}

export const pushService = {
  isConfigured: isPushConfigured,

  // Enqueue a push fan-out job. The actual per-device fan-out (with timeout,
  // allSettled, retry, and 410-deactivation) runs inside push.worker.ts so
  // the request thread isn't sitting on N round-trips to FCM. Callers get a
  // synchronous "accepted" response — delivery is best-effort and observable
  // via the BullMQ dashboards.
  async sendToUser(userId: string, payload: PushPayload): Promise<SendToUserResult> {
    if (!isPushConfigured()) {
      log.warn({ userId, type: payload.type }, 'push not configured; skipping enqueue')
      return { enqueued: false }
    }
    const job = await pushQueue.add('send-to-user', {
      kind: 'send-to-user',
      userId,
      payload,
    })
    return { enqueued: true, jobId: job.id }
  },
}
