import type { Knex } from 'knex'

// Webhook idempotency split: a single column flips the model from
// "the event was *received*" to "the event was *fully applied*".
//
// Before: stripe_event_log just had (event_id, type, received_at). The
// webhook route inserted the row before dispatch and treated any duplicate
// as already-applied — but if dispatch crashed, the row was already there,
// so Stripe's retry was silently skipped and state diverged.
//
// After: a NULL processed_at means "claimed but not finished". Stripe's
// retry sees that and re-runs dispatch (which is idempotent everywhere it
// matters — subscription upserts use ON CONFLICT, supporter grant
// short-circuits when already set). Once dispatch returns, the route
// stamps processed_at; only then is the event treated as applied.
//
// Backfill: existing rows came in under the old "record-then-dispatch"
// path that 200'd before tracking completion separately, so they were
// effectively applied. Mark them processed at received_at to preserve
// that semantic — fresh events from this migration onward earn their
// processed_at via the new flow.

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('stripe_event_log', (table) => {
    table.timestamp('processed_at', { useTz: true }).nullable()
  })

  await knex('stripe_event_log').whereNull('processed_at').update({
    processed_at: knex.ref('received_at'),
  })

  await knex.schema.alterTable('stripe_event_log', (table) => {
    table.index('processed_at')
  })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('stripe_event_log', (table) => {
    table.dropIndex('processed_at')
    table.dropColumn('processed_at')
  })
}
