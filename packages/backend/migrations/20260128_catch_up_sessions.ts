import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('game_sessions', (table) => {
    table.boolean('is_catch_up').notNullable().defaultTo(false)
  })

  await knex.raw('CREATE INDEX idx_game_sessions_catch_up ON game_sessions(is_catch_up)')
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw('DROP INDEX IF EXISTS idx_game_sessions_catch_up')

  await knex.schema.alterTable('game_sessions', (table) => {
    table.dropColumn('is_catch_up')
  })
}
