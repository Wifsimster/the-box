import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  const hasWebhooks = await knex.schema.hasTable('webhooks')
  if (!hasWebhooks) {
    await knex.schema.createTable('webhooks', (table) => {
      table.increments('id').primary()
      table.text('user_id').notNullable().references('id').inTable('user').onDelete('CASCADE')
      table.text('url').notNullable()
      table.string('secret_hash', 64).notNullable()
      table.string('secret_prefix', 16).notNullable()
      table.string('label', 64).notNullable()
      table.specificType('events', 'text[]').notNullable().defaultTo(knex.raw(`ARRAY[]::text[]`))
      table.boolean('is_active').notNullable().defaultTo(true)
      table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now())
      table.timestamp('last_delivered_at', { useTz: true }).nullable()
      table.timestamp('revoked_at', { useTz: true }).nullable()
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
      table.string('event_id', 128).notNullable()
      table.string('event_type', 64).notNullable()
      table.jsonb('payload').notNullable()
      table.string('status', 16).notNullable().defaultTo('pending')
      table.integer('attempt_count').notNullable().defaultTo(0)
      table.timestamp('next_attempt_at', { useTz: true }).notNullable().defaultTo(knex.fn.now())
      table.timestamp('delivered_at', { useTz: true }).nullable()
      table.integer('last_response_status').nullable()
      table.string('last_error', 500).nullable()
      table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now())

      table.unique(['webhook_id', 'event_id'], { indexName: 'webhook_deliveries_dedup_uniq' })
      table.index(['status', 'next_attempt_at'], 'webhook_deliveries_status_due_idx')
    })
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('webhook_deliveries')
  await knex.schema.dropTableIfExists('webhooks')
}
