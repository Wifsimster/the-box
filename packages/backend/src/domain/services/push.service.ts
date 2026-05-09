import { pushSubscriptionRepository } from '../../infrastructure/repositories/push-subscription.repository.js'
import { isPushConfigured, sendPush } from '../../infrastructure/push/push-sender.js'
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
  attempted: number
  succeeded: number
  pruned: number
}

export const pushService = {
  isConfigured: isPushConfigured,

  // Fan out to every active subscription for `userId`. We never throw on
  // per-device failures: a user with three devices, one of which the push
  // provider has declared 410 Gone, should still get the notification on the
  // other two. The 410'd row is deactivated in-place by markFailure so the
  // next send skips it.
  async sendToUser(userId: string, payload: PushPayload): Promise<SendToUserResult> {
    if (!isPushConfigured()) {
      log.warn({ userId, type: payload.type }, 'push not configured; skipping send')
      return { attempted: 0, succeeded: 0, pruned: 0 }
    }

    const subs = await pushSubscriptionRepository.listActiveForUser(userId)
    if (subs.length === 0) {
      return { attempted: 0, succeeded: 0, pruned: 0 }
    }

    let succeeded = 0
    let pruned = 0
    await Promise.all(
      subs.map(async (sub) => {
        const result = await sendPush(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload,
        )
        if (result.success) {
          await pushSubscriptionRepository.markSuccess(sub.endpoint, sub.user_id)
          succeeded += 1
        } else {
          await pushSubscriptionRepository.markFailure(
            sub.endpoint,
            sub.user_id,
            result.statusCode ?? 0,
            result.gone,
          )
          if (result.gone) pruned += 1
        }
      }),
    )

    log.info(
      { userId, type: payload.type, attempted: subs.length, succeeded, pruned },
      'push fan-out complete',
    )
    return { attempted: subs.length, succeeded, pruned }
  },
}
