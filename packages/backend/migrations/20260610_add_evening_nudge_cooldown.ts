import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('user', (table) => {
    table.timestamp('last_evening_nudge_at', { useTz: true }).nullable()
    table.boolean('feature_in_notifications').notNullable().defaultTo(true)
  })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('user', (table) => {
    table.dropColumn('last_evening_nudge_at')
    table.dropColumn('feature_in_notifications')
  })
}
