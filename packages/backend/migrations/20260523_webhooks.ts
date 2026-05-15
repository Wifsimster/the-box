import type { Knex } from 'knex'

// Public API M2 — webhooks for streamer integrations.
//
// Two tables:
//   - webhooks         : streamer-owned endpoint registrations
//   - webhook_deliveries : delivery attempts (state machine + audit trail)
//
// Hard rules baked into the schema:
//   - A delivery row is uniquely keyed on (webhook_id, event_id) so the
//     fan-out poller / completion-hook can INSERT … ON CONFLICT DO NOTHING
//     without juggling app-level dedup logic.
//   - Webhook secrets are stored as SHA-256 plus a 4-char prefix preview.
//     Plaintext is shown exactly once at registration. Even if the DB is
//     compromised, an attacker can't forge HMACs for live endpoints.
//   - `is_active` is the soft-delete flag; revoked endpoints stay in the
//     table so the owner sees their delivery history.

export async function up(knex: Knex): Promise<void> {
  const hasWebhooks = await knex.schema.hasTable('webhooks')
  if (!hasWebhooks) {
    await knex.schema.createTable('webhooks', (table) => {
      table.increments('id').primary()
      table.text('user_id').notNullable().references('id').inTable('user').onDelete('CASCADE')
      // Where deliveries are POSTed. HTTPS-only is enforced in the application
      // layer (the migration can't tell future schemes apart from typos).
      table.text('url').notNullable()
      // SHA-256 hex digest of the signing secret. 64 chars exactly.
      table.string('secret_hash', 64).notNullable()
      // First 8 chars of the plaintext (`whsec_xxxx`) shown in the dashboard
      // so the owner can disambiguate without us storing the secret.
      table.string('secret_prefix', 16).notNullable()
      // Human label set at registration: "Discord bot", "Streamer.bot", etc.
      table.string('label', 64).notNullable()
      // ARRAY of event types this endpoint subscribes to. Empty array = all.
      // Stored as text[] so adding a new event type doesn't need a migration.
      table.specificType('events', 'text[]').notNullable().defaultTo(knex.raw(`ARRAY[]::text[]`))
      table.boolean('is_active').notNullable().defaultTo(true)
      table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now())
      table.timestamp('last_delivered_at', { useTz: true }).nullable()
      table.timestamp('revoked_at', { useTz: true }).nullable()
      // Hot path: enumerate active webhooks for one user when a session completes.
      table.index(['user_id', 'is_active'], 'webhooks_user_active_idx')
    })
  }

  const hasDeliveries = await knex.schema.hasTable('webhook_deliveries')
  if (!hasDeliveries) {
    await knex.schema.createTable('webhook_deliveries', (table) => {
      table.increments('id').primary()
      table
        .integer('webhook_id')
        .notNullable()
        .references('id')
        .inTable('webhooks')
        .onDelete('CASCADE')
      // Stable id of the originating event. For session-completed it's
      // `session.completed:<game_session_id>` — uniqueness with `webhook_id`
      // gives idempotent enqueue under retry / poller re-runs.
      table.string('event_id', 128).notNullable()
      table.string('event_type', 64).notNullable()
      // Final POST body. Stored once at enqueue so retries send the same bytes
      // even if the source row has since changed.
      table.jsonb('payload').notNullable()
      // pending → in_progress → delivered | failed | dead
      // dead = 3 retries exhausted; lives in the table for 24h debugging
      // before the cleanup worker drops it.
      table.string('status', 16).notNullable().defaultTo('pending')
      table.integer('attempt_count').notNullable().defaultTo(0)
      table.timestamp('next_attempt_at', { useTz: true }).notNullable().defaultTo(knex.fn.now())
      table.timestamp('delivered_at', { useTz: true }).nullable()
      table.integer('last_response_status').nullable()
      // Truncated to 500 — enough to triage, not enough to leak a stack trace.
      table.string('last_error', 500).nullable()
      table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now())

      // Idempotency key for INSERT … ON CONFLICT DO NOTHING.
      table.unique(['webhook_id', 'event_id'], { indexName: 'webhook_deliveries_dedup_uniq' })
      // Hot path: worker query — "give me pending deliveries due before now".
      table.index(['status', 'next_attempt_at'], 'webhook_deliveries_status_due_idx')
    })
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('webhook_deliveries')
  await knex.schema.dropTableIfExists('webhooks')
}
