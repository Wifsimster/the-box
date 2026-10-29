import type { Knex } from 'knex'

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
