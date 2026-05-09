import { db } from '../database/connection.js'
import { repoLogger } from '../logger/logger.js'

const log = repoLogger.child({ repository: 'push-subscription' })

export interface PushSubscriptionRow {
  id: number
  user_id: string
  endpoint: string
  p256dh: string
  auth: string
  user_agent: string | null
  is_active: boolean
  created_at: Date
  last_success_at: Date | null
  last_failure_at: Date | null
  last_failure_status: number | null
}

export interface UpsertSubscriptionInput {
  userId: string
  endpoint: string
  p256dh: string
  auth: string
  userAgent?: string
}

export const pushSubscriptionRepository = {
  // Upsert keyed on `endpoint` so re-subscribing the same device just bumps
  // user/active rather than creating duplicate rows. A device that re-binds
  // to a different user (account switch on the same browser) cleanly moves
  // the row to the new user_id thanks to the conflict target.
  async upsert(input: UpsertSubscriptionInput): Promise<PushSubscriptionRow> {
    const rows = await db('push_subscriptions')
      .insert({
        user_id: input.userId,
        endpoint: input.endpoint,
        p256dh: input.p256dh,
        auth: input.auth,
        user_agent: input.userAgent ?? null,
        is_active: true,
      })
      .onConflict('endpoint')
      .merge({
        user_id: input.userId,
        p256dh: input.p256dh,
        auth: input.auth,
        user_agent: input.userAgent ?? null,
        is_active: true,
      })
      .returning<PushSubscriptionRow[]>('*')
    const row = rows[0]
    if (!row) throw new Error('upsert returned no row')
    log.info({ userId: input.userId, endpoint: redact(input.endpoint) }, 'push subscription upserted')
    return row
  },

  async listActiveForUser(userId: string): Promise<PushSubscriptionRow[]> {
    return db('push_subscriptions')
      .where({ user_id: userId, is_active: true })
      .select<PushSubscriptionRow[]>('*')
  },

  // Endpoint is globally unique, so this either deletes one row or zero. We
  // hard-delete on explicit unsubscribe (vs. is_active=false) because the
  // user has signaled intent to revoke; keeping the row would just clutter.
  // Scoped by user_id to prevent any authenticated caller from unsubscribing
  // someone else's device by guessing or learning their endpoint URL.
  async deleteByEndpoint(endpoint: string, userId: string): Promise<boolean> {
    const deleted = await db('push_subscriptions').where({ endpoint, user_id: userId }).del()
    return deleted > 0
  },

  async markSuccess(endpoint: string, userId: string): Promise<void> {
    await db('push_subscriptions')
      .where({ endpoint, user_id: userId })
      .update({ last_success_at: db.fn.now(), last_failure_at: null, last_failure_status: null })
  },

  // 4xx/5xx response. Service decides whether to flip is_active based on
  // status (410/404 → terminally gone → flip).
  async markFailure(
    endpoint: string,
    userId: string,
    status: number,
    deactivate: boolean,
  ): Promise<void> {
    await db('push_subscriptions')
      .where({ endpoint, user_id: userId })
      .update({
        last_failure_at: db.fn.now(),
        last_failure_status: status,
        ...(deactivate ? { is_active: false } : {}),
      })
  },
}

// Endpoints contain a per-device token; redact the path tail when logging so
// the full token doesn't end up in log aggregators.
function redact(endpoint: string): string {
  const idx = endpoint.lastIndexOf('/')
  if (idx < 0 || idx >= endpoint.length - 1) return endpoint
  return `${endpoint.slice(0, idx + 1)}…`
}
