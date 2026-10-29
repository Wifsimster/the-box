import type { Knex } from 'knex'
import type { Logger } from 'pino'

const EMAIL_LOG_RETENTION_DAYS = 365

const ADMIN_AUDIT_LOG_RETENTION_DAYS = 730

const WEBHOOK_DELIVERIES_RETENTION_DAYS = 30

const STRIPE_EVENT_LOG_RETENTION_DAYS = 365

export const DESCRIBE_GUESS_RETENTION_DAYS = 180

export interface DataRetentionDeps {
  db: Knex
  logger: Logger
}

export interface DataRetentionResult {
  emailLogDeleted: number
  adminAuditLogDeleted: number
  webhookDeliveriesDeleted: number
  stripeEventLogDeleted: number
  describeGuessAttemptsDeleted: number
  message: string
}

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

  const describeGuessAttemptsDeleted = await pruneOlderThan(
    db,
    'describe_guess_attempts',
    'created_at',
    DESCRIBE_GUESS_RETENTION_DAYS
  )

  const message =
    `data retention complete: email_log=${emailLogDeleted} (>${EMAIL_LOG_RETENTION_DAYS}d), ` +
    `admin_audit_log=${adminAuditLogDeleted} (>${ADMIN_AUDIT_LOG_RETENTION_DAYS}d), ` +
    `webhook_deliveries=${webhookDeliveriesDeleted} (>${WEBHOOK_DELIVERIES_RETENTION_DAYS}d), ` +
    `stripe_event_log=${stripeEventLogDeleted} (>${STRIPE_EVENT_LOG_RETENTION_DAYS}d), ` +
    `describe_guess_attempts=${describeGuessAttemptsDeleted} (>${DESCRIBE_GUESS_RETENTION_DAYS}d)`

  const result: DataRetentionResult = {
    emailLogDeleted,
    adminAuditLogDeleted,
    webhookDeliveriesDeleted,
    stripeEventLogDeleted,
    describeGuessAttemptsDeleted,
    message,
  }

  log.info(result, 'data retention sweep complete')
  return result
}
