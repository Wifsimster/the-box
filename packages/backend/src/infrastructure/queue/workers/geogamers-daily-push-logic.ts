/**
 * GeoGamers daily push fan-out.
 *
 * Fired once, right after a new GeoGamers challenge is created, to tell
 * subscribed players "today's panorama is live". Enumerates active,
 * non-anonymous push subscribers and enqueues a per-user send (the push
 * worker handles the per-device fan-out, retries, and 410-pruning).
 *
 * Best-effort and idempotent-enough: it runs only on the day's first
 * successful challenge creation (the scheduler is idempotent per date), so a
 * container restart that re-runs the already-created challenge won't re-notify.
 */

import { db } from '../../database/connection.js'
import { queueLogger } from '../../logger/logger.js'
import { pushService } from '../../../domain/services/index.js'
import { buildGeoGamersDailyCopy } from '../../../domain/services/geogamers-daily-push-copy.js'

const log = queueLogger.child({ module: 'geogamers-daily-push' })

export { buildGeoGamersDailyCopy }

interface Subscriber {
  id: string
}

export interface GeoGamersDailyPushResult {
  candidates: number
  enqueued: number
  failed: number
  skipped: boolean
  message: string
}

// Exported for testing: active, non-anonymous push subscribers (deduped).
// Note: the `user` table stores no per-user locale, so copy defaults to French
// (the app's default locale); the deep-link uses the same.
export async function findSubscribers(): Promise<Subscriber[]> {
  return db('user')
    .join('push_subscriptions', 'push_subscriptions.user_id', 'user.id')
    .where('push_subscriptions.is_active', true)
    .whereRaw('"user"."isAnonymous" = ?', [false])
    .distinct<Subscriber[]>('user.id as id')
}

export async function sendGeoGamersDailyPush(
  onProgress?: (current: number, total: number) => void,
): Promise<GeoGamersDailyPushResult> {
  if (!pushService.isConfigured()) {
    log.info('push not configured; skipping geogamers daily fan-out')
    return { candidates: 0, enqueued: 0, failed: 0, skipped: true, message: 'push not configured' }
  }

  const subscribers = await findSubscribers()
  let enqueued = 0
  let failed = 0

  // No stored per-user locale → default to French (app default).
  const { title, body } = buildGeoGamersDailyCopy('fr')

  for (let i = 0; i < subscribers.length; i++) {
    const sub = subscribers[i]!
    onProgress?.(i + 1, subscribers.length)
    try {
      await pushService.sendToUser(sub.id, {
        type: 'geogamers_daily',
        title,
        body,
        url: '/fr/geogamers',
      })
      enqueued++
    } catch (err) {
      failed++
      log.warn({ userId: sub.id, err: String(err) }, 'geogamers daily push enqueue failed')
    }
  }

  const message = `geogamers-daily-push: candidates=${subscribers.length} enqueued=${enqueued} failed=${failed}`
  log.info({ enqueued, failed, candidates: subscribers.length }, message)
  return { candidates: subscribers.length, enqueued, failed, skipped: false, message }
}
