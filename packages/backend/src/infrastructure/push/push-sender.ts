import webpush from 'web-push'
import { env } from '../../config/env.js'
import { logger } from '../logger/logger.js'

const log = logger.child({ module: 'push-sender' })

let configured = false

export function isPushConfigured(): boolean {
  return Boolean(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY && env.VAPID_SUBJECT)
}

function ensureConfigured(): void {
  if (configured) return
  if (!isPushConfigured()) {
    throw new Error('web push not configured: VAPID keys missing')
  }
  webpush.setVapidDetails(env.VAPID_SUBJECT, env.VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY)
  configured = true
  log.info('web push initialized')
}

export interface PushSubscriptionTarget {
  endpoint: string
  keys: { p256dh: string; auth: string }
}

export interface SendResult {
  success: boolean
  // HTTP status returned by the push provider (Firebase, autopush, …). 201
  // typically means "accepted, will deliver". 410/404 means the subscription
  // is gone for good and should be deactivated.
  statusCode?: number
  // True iff the subscription should be removed/deactivated by the caller.
  gone: boolean
}

export async function sendPush(
  target: PushSubscriptionTarget,
  payload: unknown,
): Promise<SendResult> {
  ensureConfigured()
  try {
    const res = await webpush.sendNotification(target, JSON.stringify(payload))
    return { success: true, statusCode: res.statusCode, gone: false }
  } catch (err) {
    const status =
      typeof err === 'object' && err !== null && 'statusCode' in err
        ? Number((err as { statusCode: unknown }).statusCode)
        : undefined
    const gone = status === 404 || status === 410
    log.warn({ statusCode: status, gone }, 'push send failed')
    return { success: false, statusCode: status, gone }
  }
}
