import type { Knex } from 'knex'

/**
 * Funnel telemetry: lightweight event log for measuring first-session
 * drop-off and core-loop engagement.
 *
 * `event_name` is free-form (e.g., session_started, guess_submitted,
 * session_completed, session_abandoned). `payload` is a JSONB bag for
 * event-specific context (position, is_correct, time_taken_ms, etc.).
 * `user_id` is nullable so anonymous/logged-out events still land.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('funnel_events', (table) => {
    table.bigIncrements('id').primary()
    table.string('user_id').nullable()
    table.string('session_id').nullable()
    table.string('event_name', 64).notNullable()
    table.jsonb('payload').nullable()
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now())
  })

  await knex.schema.alterTable('funnel_events', (table) => {
    table.index('event_name', 'idx_funnel_events_event_name')
    table.index('user_id', 'idx_funnel_events_user_id')
    table.index('created_at', 'idx_funnel_events_created_at')
  })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('funnel_events')
}
