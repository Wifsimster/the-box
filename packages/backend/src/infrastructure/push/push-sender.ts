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
  statusCode?: number
  gone: boolean
  retryable: boolean
}

const SEND_TIMEOUT_MS = 8_000

export async function sendPush(
  target: PushSubscriptionTarget,
  payload: unknown,
): Promise<SendResult> {
  ensureConfigured()
  try {
    const res = await Promise.race([
      webpush.sendNotification(target, JSON.stringify(payload)),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new PushTimeoutError(SEND_TIMEOUT_MS)), SEND_TIMEOUT_MS),
      ),
    ])
    return { success: true, statusCode: res.statusCode, gone: false, retryable: false }
  } catch (err) {
    if (err instanceof PushTimeoutError) {
      log.warn({ timeoutMs: err.timeoutMs }, 'push send timed out')
      return { success: false, gone: false, retryable: true }
    }
    const status =
      typeof err === 'object' && err !== null && 'statusCode' in err
        ? Number((err as { statusCode: unknown }).statusCode)
        : undefined
    const gone = status === 404 || status === 410
    const retryable = !gone && (status === undefined || status >= 500 || status === 429)
    log.warn({ statusCode: status, gone, retryable }, 'push send failed')
    return { success: false, statusCode: status, gone, retryable }
  }
}

class PushTimeoutError extends Error {
  constructor(public readonly timeoutMs: number) {
    super(`push send timed out after ${timeoutMs}ms`)
    this.name = 'PushTimeoutError'
  }
}
