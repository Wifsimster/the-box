import type { Knex } from 'knex'

/**
 * Add is_catch_up column to game_sessions table
 * Catch-up sessions are when a user plays a previous day's challenge
 * These sessions don't count towards the leaderboard
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('game_sessions', (table) => {
    table.boolean('is_catch_up').notNullable().defaultTo(false)
  })

  // Add index for efficient filtering
  await knex.raw('CREATE INDEX idx_game_sessions_catch_up ON game_sessions(is_catch_up)')
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw('DROP INDEX IF EXISTS idx_game_sessions_catch_up')

  await knex.schema.alterTable('game_sessions', (table) => {
    table.dropColumn('is_catch_up')
  })
}
