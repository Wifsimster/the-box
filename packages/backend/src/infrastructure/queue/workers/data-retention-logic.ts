/**
 * Data Retention Logic (RGPD Art. 5(1)(e) — storage limitation)
 *
 * Personal-data-bearing audit / log tables grow without bound. This recurring
 * job hard-deletes rows past a per-table retention window so we don't keep
 * personal data longer than is necessary for the purpose it was collected.
 *
 * Each window is a named constant with its rationale. Every table is guarded
 * with `hasTable` so an environment missing a given migration can't crash the
 * whole run — a missing table simply contributes 0 to the counts.
 *
 * Deps are injected ({ db, logger }) to match the sibling worker-logic
 * modules and keep this unit-testable.
 */

import type { Knex } from 'knex'
import type { Logger } from 'pino'

// Email send history: 1 year. Long enough to investigate deliverability
// complaints / unsubscribe disputes, short enough not to hoard recipient
// addresses indefinitely.
const EMAIL_LOG_RETENTION_DAYS = 365

// Admin audit trail: 2 years. Security / accountability records are kept
// longer than operational logs but still bounded.
const ADMIN_AUDIT_LOG_RETENTION_DAYS = 730

// Webhook delivery attempts: 30 days. Purely operational debugging data;
// the streamer only needs recent history to diagnose a broken endpoint.
const WEBHOOK_DELIVERIES_RETENTION_DAYS = 30

// Stripe webhook idempotency log: 1 year. Far beyond Stripe's retry window,
// so dropping older rows can't cause a duplicate event to be re-applied.
const STRIPE_EVENT_LOG_RETENTION_DAYS = 365

export interface DataRetentionDeps {
  db: Knex
  logger: Logger
}

export interface DataRetentionResult {
  emailLogDeleted: number
  adminAuditLogDeleted: number
  webhookDeliveriesDeleted: number
  stripeEventLogDeleted: number
  message: string
}

// Delete rows in `table` whose `column` timestamp is older than `days`,
// guarded by hasTable so a missing table degrades to 0.
async function pruneOlderThan(
  db: Knex,
  table: string,
  column: string,
  days: number
): Promise<number> {
  const exists = await db.schema.hasTable(table)
  if (!exists) return 0
  return db(table)
    .where(column, '<', db.raw(`NOW() - INTERVAL '${days} days'`))
    .del()
}

export async function runDataRetention(
  deps: DataRetentionDeps
): Promise<DataRetentionResult> {
  const { db, logger } = deps
  const log = logger.child({ worker: 'data-retention' })

  log.info('starting data retention sweep')

  const emailLogDeleted = await pruneOlderThan(
    db,
    'email_log',
    'sent_at',
    EMAIL_LOG_RETENTION_DAYS
  )

  const adminAuditLogDeleted = await pruneOlderThan(
    db,
    'admin_audit_log',
    'created_at',
    ADMIN_AUDIT_LOG_RETENTION_DAYS
  )

  const webhookDeliveriesDeleted = await pruneOlderThan(
    db,
    'webhook_deliveries',
    'created_at',
    WEBHOOK_DELIVERIES_RETENTION_DAYS
  )

  const stripeEventLogDeleted = await pruneOlderThan(
    db,
    'stripe_event_log',
    'received_at',
    STRIPE_EVENT_LOG_RETENTION_DAYS
  )

  const message =
    `data retention complete: email_log=${emailLogDeleted} (>${EMAIL_LOG_RETENTION_DAYS}d), ` +
    `admin_audit_log=${adminAuditLogDeleted} (>${ADMIN_AUDIT_LOG_RETENTION_DAYS}d), ` +
    `webhook_deliveries=${webhookDeliveriesDeleted} (>${WEBHOOK_DELIVERIES_RETENTION_DAYS}d), ` +
    `stripe_event_log=${stripeEventLogDeleted} (>${STRIPE_EVENT_LOG_RETENTION_DAYS}d)`

  const result: DataRetentionResult = {
    emailLogDeleted,
    adminAuditLogDeleted,
    webhookDeliveriesDeleted,
    stripeEventLogDeleted,
    message,
  }

  log.info(result, 'data retention sweep complete')
  return result
}
