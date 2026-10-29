import { db } from '../../database/connection.js'
import { queueLogger } from '../../logger/logger.js'
import {
  pushService,
} from '../../../composition/services.js'
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
