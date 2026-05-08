import type { Knex } from 'knex'

// Web Push subscription storage. One row per (user, endpoint): a single user
// can have multiple devices subscribed (phone + desktop browser), and the
// `endpoint` is the natural key the browser hands us — globally unique per
// device/origin. We don't drop rows when push fails; the service flips
// `is_active=false` after a 410 Gone or 404 from the push provider so the
// next send cycle skips them. Reactivation happens on the next subscribe
// call from that endpoint, which upserts is_active back to true.

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('push_subscriptions', (table) => {
    table.increments('id').primary()
    table.string('user_id', 64).notNullable()
    // The push service URL the browser obtained from its registration server
    // (Firebase, Mozilla autopush, Apple, etc.). Up to ~500 chars in practice.
    table.text('endpoint').notNullable()
    // Public key the push service will encrypt the payload against.
    table.string('p256dh', 200).notNullable()
    // Auth secret produced by the browser at subscribe-time.
    table.string('auth', 50).notNullable()
    // Browser-reported user-agent string at subscribe time. Optional but useful
    // for debugging "why is this device getting two notifications".
    table.string('user_agent', 500).nullable()
    table.boolean('is_active').notNullable().defaultTo(true)
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now())
    // Last time the push service responded 2xx to a send. Updated by the
    // service after each successful delivery so we can prune subscriptions
    // that haven't responded successfully in N days.
    table.timestamp('last_success_at', { useTz: true }).nullable()
    // Last 4xx/5xx response from the push service, recorded so admins can
    // diagnose why a device stopped receiving without scraping logs.
    table.timestamp('last_failure_at', { useTz: true }).nullable()
    table.integer('last_failure_status').nullable()

    // The endpoint is globally unique per device — re-subscribing yields the
    // same endpoint. Unique on endpoint alone (not scoped to user) so a
    // device that switches accounts cleanly re-points to the new user via
    // the upsert path.
    table.unique(['endpoint'], { indexName: 'push_subscriptions_endpoint_uniq' })
    // Hot path: enumerate active subscriptions for a single user when sending.
    table.index(['user_id', 'is_active'], 'push_subscriptions_user_active_idx')
  })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('push_subscriptions')
}
