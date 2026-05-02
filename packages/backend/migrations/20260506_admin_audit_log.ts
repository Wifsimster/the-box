import type { Knex } from 'knex'

// Persistent audit trail for admin write actions. Every destructive or
// state-changing admin geo route appends one row here so we can answer
// "who did what, and when" without having to grep Pino logs. JSON columns
// hold the action's before/after payload — kept tiny by callers (only
// the ids and the changed fields, never blobs).
//
// Indexed on (admin_id, created_at) and (target_kind, target_id) so we
// can render a user-facing "what did this admin touch in the last hour"
// view AND a "history of this game" view at near-zero cost. created_at
// drives the default sort and is on its own index for the global view.

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('admin_audit_log', (table) => {
    table.bigIncrements('id').primary()
    table.string('admin_id', 64).notNullable()
    table.string('action', 100).notNullable()
    table.string('target_kind', 64).notNullable()
    table.string('target_id', 100).nullable()
    // Optional structured before/after snapshots. Callers keep these tiny:
    // ids + flipped flags only, never full rows. JSONB so we can grep them
    // with pg operators when investigating a specific incident.
    table.jsonb('before').nullable()
    table.jsonb('after').nullable()
    // request id (when the request-id middleware is added) + ip kept as
    // optional strings so we can correlate with logs after the fact.
    table.string('request_id', 64).nullable()
    table.string('ip', 64).nullable()
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now())

    table.index(['admin_id', 'created_at'], 'admin_audit_log_admin_idx')
    table.index(['target_kind', 'target_id'], 'admin_audit_log_target_idx')
    table.index('action', 'admin_audit_log_action_idx')
    table.index('created_at', 'admin_audit_log_created_idx')
  })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('admin_audit_log')
}
