import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('tier_sessions', (table) => {
    table.timestamp('round_started_at', { useTz: true }).nullable()
    table.integer('round_position').nullable()
  })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('tier_sessions', (table) => {
    table.dropColumn('round_position')
    table.dropColumn('round_started_at')
  })
}
