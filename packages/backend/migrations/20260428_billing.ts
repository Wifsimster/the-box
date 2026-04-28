import type { Knex } from 'knex'

// Billing foundation for Premium subscriptions backed by Stripe.
//
// Schema split:
//   - user.stripe_customer_id  → 1:1 link to a Stripe Customer, lazy-created
//                                on first checkout. Nullable: free users
//                                never get a Customer object until they try
//                                to pay.
//   - subscriptions            → mirror of Stripe Subscription state, kept
//                                in sync via webhook. Source of truth for
//                                "is this user premium right now" without
//                                round-tripping to Stripe per request.
//   - stripe_event_log         → idempotency table. Stripe retries webhooks
//                                aggressively; the unique PK on event.id
//                                guarantees we apply each event exactly once.
//
// The `entitlements` cache from the proposal is intentionally deferred:
// `subscriptions` already gives O(1) lookup by user_id + status, and adding
// a denormalized cache before measuring contention is premature.

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('user', (table) => {
    table.text('stripe_customer_id').nullable().unique()
  })

  await knex.schema.createTable('subscriptions', (table) => {
    table.increments('id').primary()
    table
      .text('user_id')
      .notNullable()
      .references('id')
      .inTable('user')
      .onDelete('CASCADE')
    table.text('stripe_subscription_id').notNullable().unique()
    table.text('stripe_price_id').notNullable()
    table
      .string('status', 32)
      .notNullable()
      .comment('active | trialing | past_due | canceled | incomplete | incomplete_expired | unpaid | paused')
    table.timestamp('current_period_end', { useTz: true }).nullable()
    table.boolean('cancel_at_period_end').notNullable().defaultTo(false)
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now())
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now())

    table.index('user_id')
    table.index(['user_id', 'status'])
  })

  // Webhook idempotency. We INSERT (event_id) inside the same transaction
  // that applies the event's effect; a duplicate webhook hits the unique
  // PK and the handler short-circuits without re-applying.
  await knex.schema.createTable('stripe_event_log', (table) => {
    table.text('event_id').primary()
    table.string('type', 64).notNullable()
    table.timestamp('received_at', { useTz: true }).notNullable().defaultTo(knex.fn.now())
  })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('stripe_event_log')
  await knex.schema.dropTableIfExists('subscriptions')
  await knex.schema.alterTable('user', (table) => {
    table.dropColumn('stripe_customer_id')
  })
}
