import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  // Add countdown scoring columns to game_sessions
  await knex.schema.alterTable('game_sessions', (table) => {
    table.integer('initial_score').notNullable().defaultTo(1000)
    table.integer('decay_rate').notNullable().defaultTo(2)
  })

  // Add try tracking columns to guesses
  await knex.schema.alterTable('guesses', (table) => {
    table.integer('try_number').notNullable().defaultTo(1)
    table.integer('session_elapsed_ms')
  })

  // Add index for efficient try count lookups
  await knex.schema.alterTable('guesses', (table) => {
    table.index(['tier_session_id', 'position'], 'guesses_tier_position_idx')
  })
}

export async function down(knex: Knex): Promise<void> {
  // Remove index
  await knex.schema.alterTable('guesses', (table) => {
    table.dropIndex(['tier_session_id', 'position'], 'guesses_tier_position_idx')
  })

  // Remove guesses columns
  await knex.schema.alterTable('guesses', (table) => {
    table.dropColumn('try_number')
    table.dropColumn('session_elapsed_ms')
  })

  // Remove game_sessions columns
  await knex.schema.alterTable('game_sessions', (table) => {
    table.dropColumn('initial_score')
    table.dropColumn('decay_rate')
  })
}
