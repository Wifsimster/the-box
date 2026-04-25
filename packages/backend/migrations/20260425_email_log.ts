import type { Knex } from 'knex'

/**
 * Persistent audit log for every email the platform sends — Resend's own
 * dashboard is fine for ops but not exposed to in-app admins, and the
 * per-user "last_*_email_at" stamps on the user table only hold the
 * latest send per channel. This table holds one row per attempt
 * regardless of outcome so the admin panel can surface a full history
 * filtered by recipient, type, status, or time window.
 *
 * `body` is intentionally *not* stored: bodies are 5–10 KB each and grow
 * the table fast, and a subject + type pair is enough for moderation.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('email_log', (table) => {
    table.increments('id').primary()
    // Nullable — admin "test" sends and emails to deleted users still
    // need to be logged.
    table.string('user_id').nullable()
    table.string('recipient', 320).notNullable()
    // Free-form so future email types don't require a migration. The
    // app-level `EmailType` union narrows the values written.
    table.string('type', 64).notNullable()
    table.string('subject', 512).notNullable()
    // 'sent' | 'failed' | 'skipped' — kept as text for the same reason
    // as `type` above.
    table.string('status', 16).notNullable()
    // Resend's own message id when present, useful for cross-referencing
    // their dashboard.
    table.string('provider_message_id').nullable()
    // Truncated error string — Resend errors are short but a user-supplied
    // address could surface a long SMTP rejection.
    table.string('error_message', 1024).nullable()
    table.timestamp('sent_at').notNullable().defaultTo(knex.fn.now())

    table.index('sent_at')
    table.index('user_id')
    table.index('type')
    table.index('status')
  })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('email_log')
}
