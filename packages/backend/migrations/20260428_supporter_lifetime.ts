import type { Knex } from 'knex'

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
