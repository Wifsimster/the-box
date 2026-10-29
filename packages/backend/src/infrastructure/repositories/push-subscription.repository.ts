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

  async countActiveForUser(userId: string): Promise<number> {
    const result = await db('push_subscriptions')
      .where({ user_id: userId, is_active: true })
      .count<{ count: string }[]>('* as count')
    const first = result[0]
    return first ? Number(first.count) : 0
  },

  async findByEndpoint(endpoint: string): Promise<PushSubscriptionRow | null> {
    const row = await db('push_subscriptions')
      .where({ endpoint })
      .first<PushSubscriptionRow | undefined>('*')
    return row ?? null
  },

  async deleteByEndpoint(endpoint: string, userId: string): Promise<boolean> {
    const deleted = await db('push_subscriptions').where({ endpoint, user_id: userId }).del()
    return deleted > 0
  },

  async markSuccess(endpoint: string, userId: string): Promise<void> {
    await db('push_subscriptions')
      .where({ endpoint, user_id: userId })
      .update({ last_success_at: db.fn.now(), last_failure_at: null, last_failure_status: null })
  },

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

  async pruneStale(deactivatedBeforeMs: number): Promise<number> {
    const cutoff = new Date(Date.now() - deactivatedBeforeMs)
    return db('push_subscriptions')
      .where('is_active', false)
      .andWhere((qb) =>
        qb.where('last_failure_at', '<', cutoff).orWhereNull('last_failure_at'),
      )
      .del()
  },
}

function redact(endpoint: string): string {
  const idx = endpoint.lastIndexOf('/')
  if (idx < 0 || idx >= endpoint.length - 1) return endpoint
  return `${endpoint.slice(0, idx + 1)}…`
}
