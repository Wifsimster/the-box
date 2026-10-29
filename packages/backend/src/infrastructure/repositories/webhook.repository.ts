import crypto from 'node:crypto'
import { db } from '../database/connection.js'
import { encryptSecret, decryptSecret } from '../crypto/secret-box.js'
import type { PublicEventType, WebhookSummary } from '@the-box/types'

const SECRET_BODY_BYTES = 32
const SECRET_PREFIX = 'whsec_'

export interface WebhookRow {
  id: number
  user_id: string
  url: string
  secret_hash: string
  secret_prefix: string
  secret_enc: string | null
  label: string
  events: PublicEventType[]
  is_active: boolean
  created_at: Date
  last_delivered_at: Date | null
  revoked_at: Date | null
}

export interface WebhookDeliveryRow {
  id: number
  webhook_id: number
  event_id: string
  event_type: string
  payload: Record<string, unknown>
  status: 'pending' | 'in_progress' | 'delivered' | 'failed' | 'dead'
  attempt_count: number
  next_attempt_at: Date
  delivered_at: Date | null
  last_response_status: number | null
  last_error: string | null
  created_at: Date
}

function mapWebhook(row: WebhookRow): WebhookSummary {
  return {
    id: row.id,
    url: row.url,
    label: row.label,
    secretPrefix: row.secret_prefix,
    events: row.events,
    isActive: row.is_active,
    createdAt: row.created_at.toISOString(),
    lastDeliveredAt: row.last_delivered_at?.toISOString() ?? null,
  }
}

export function hashWebhookSecret(plaintext: string): string {
  return crypto.createHash('sha256').update(plaintext, 'utf8').digest('hex')
}

function generateSecret(): string {
  return SECRET_PREFIX + crypto.randomBytes(SECRET_BODY_BYTES).toString('base64url')
}

export const webhookRepository = {
  async create(params: {
    userId: string
    url: string
    label: string
    events: PublicEventType[]
  }): Promise<{ row: WebhookRow; secret: string }> {
    const secret = generateSecret()
    const secretHash = hashWebhookSecret(secret)
    const secretPrefix = secret.slice(0, 12)

    const [row] = await db('webhooks')
      .insert({
        user_id: params.userId,
        url: params.url,
        secret_hash: secretHash,
        secret_prefix: secretPrefix,
        secret_enc: encryptSecret(secret),
        label: params.label,
        events: params.events,
      })
      .returning<WebhookRow[]>('*')
    return { row: row!, secret }
  },

  decryptSecret(row: Pick<WebhookRow, 'secret_enc'>): string | null {
    return row.secret_enc ? decryptSecret(row.secret_enc) : null
  },

  async findActiveByUserAndEvent(userId: string, event: PublicEventType): Promise<WebhookRow[]> {
    return await db('webhooks')
      .where('user_id', userId)
      .andWhere('is_active', true)
      .andWhereRaw(`(coalesce(array_length(events, 1), 0) = 0 OR ? = ANY(events))`, [event])
      .select<WebhookRow[]>('*')
  },

  async findByUser(userId: string): Promise<WebhookRow[]> {
    return await db('webhooks')
      .where('user_id', userId)
      .orderBy('created_at', 'desc')
      .select<WebhookRow[]>('*')
  },

  async findOwnedById(userId: string, id: number): Promise<WebhookRow | null> {
    const row = await db('webhooks')
      .where('id', id)
      .andWhere('user_id', userId)
      .first<WebhookRow>()
    return row ?? null
  },

  async revoke(id: number, userId: string): Promise<boolean> {
    const updated = await db('webhooks')
      .where('id', id)
      .andWhere('user_id', userId)
      .andWhere('is_active', true)
      .update({ is_active: false, revoked_at: db.fn.now() })
    return updated > 0
  },

  async markDelivered(id: number): Promise<void> {
    await db('webhooks').where('id', id).update({ last_delivered_at: db.fn.now() })
  },

  mapWebhook,
}

export const webhookDeliveryRepository = {
  async enqueue(params: {
    webhookId: number
    eventId: string
    eventType: PublicEventType
    payload: Record<string, unknown>
  }): Promise<WebhookDeliveryRow | null> {
    const rows = await db('webhook_deliveries')
      .insert({
        webhook_id: params.webhookId,
        event_id: params.eventId,
        event_type: params.eventType,
        payload: JSON.stringify(params.payload),
        status: 'pending',
        attempt_count: 0,
      })
      .onConflict(['webhook_id', 'event_id'])
      .ignore()
      .returning<WebhookDeliveryRow[]>('*')
    return rows[0] ?? null
  },

  async findById(id: number): Promise<WebhookDeliveryRow | null> {
    const row = await db('webhook_deliveries').where('id', id).first<WebhookDeliveryRow>()
    return row ?? null
  },

  async markInProgress(id: number): Promise<boolean> {
    const updated = await db('webhook_deliveries')
      .where('id', id)
      .andWhere('status', 'pending')
      .update({ status: 'in_progress' })
    return updated > 0
  },

  async markDelivered(id: number, status: number): Promise<void> {
    await db('webhook_deliveries')
      .where('id', id)
      .update({
        status: 'delivered',
        delivered_at: db.fn.now(),
        last_response_status: status,
        last_error: null,
      })
  },

  async markFailed(params: {
    id: number
    status: number | null
    error: string
    nextAttemptAt: Date | null
    isDead: boolean
  }): Promise<void> {
    await db('webhook_deliveries')
      .where('id', params.id)
      .update({
        status: params.isDead ? 'dead' : 'pending',
        attempt_count: db.raw('attempt_count + 1'),
        last_response_status: params.status,
        last_error: params.error.slice(0, 500),
        next_attempt_at: params.nextAttemptAt ?? db.fn.now(),
      })
  },
}
