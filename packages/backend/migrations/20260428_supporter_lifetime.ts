import type { Knex } from 'knex'

// Single-column entitlement for the one-time Supporter tier. We could
// model this as a separate table for cleanliness, but it's a 1:1 grant
// keyed on user with no per-grant metadata worth keeping out-of-line —
// timestamp on user keeps the read path single-row and lets the existing
// findById join pick it up for free.
//
// `subscriptions` is the right home for recurring tiers; lifetime grants
// don't have a stripe_subscription_id so they wouldn't fit that table
// without making fields nullable that are otherwise notNullable.

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('user', (table) => {
    table.timestamp('supporter_lifetime_at', { useTz: true }).nullable()
  })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('user', (table) => {
    table.dropColumn('supporter_lifetime_at')
  })
}
