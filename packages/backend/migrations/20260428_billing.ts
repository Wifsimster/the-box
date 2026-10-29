import type { Knex } from 'knex'

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
