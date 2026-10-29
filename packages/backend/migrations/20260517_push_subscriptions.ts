import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('push_subscriptions', (table) => {
    table.increments('id').primary()
    table.string('user_id', 64).notNullable()
    table.text('endpoint').notNullable()
    table.string('p256dh', 200).notNullable()
    table.string('auth', 50).notNullable()
    table.string('user_agent', 500).nullable()
    table.boolean('is_active').notNullable().defaultTo(true)
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now())
    table.timestamp('last_success_at', { useTz: true }).nullable()
    table.timestamp('last_failure_at', { useTz: true }).nullable()
    table.integer('last_failure_status').nullable()

    table.unique(['endpoint'], { indexName: 'push_subscriptions_endpoint_uniq' })
    table.index(['user_id', 'is_active'], 'push_subscriptions_user_active_idx')
  })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('push_subscriptions')
}
