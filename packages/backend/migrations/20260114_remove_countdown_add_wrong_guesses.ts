import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  // Drop countdown scoring columns from game_sessions
  await knex.schema.alterTable('game_sessions', (table) => {
    table.dropColumn('initial_score')
    table.dropColumn('decay_rate')
  })

  // Add wrong_guesses column to tier_sessions
  await knex.schema.alterTable('tier_sessions', (table) => {
    table.integer('wrong_guesses').notNullable().defaultTo(0)
  })
}

export async function down(knex: Knex): Promise<void> {
  // Restore countdown scoring columns
  await knex.schema.alterTable('game_sessions', (table) => {
    table.integer('initial_score').notNullable().defaultTo(1000)
    table.integer('decay_rate').notNullable().defaultTo(2)
  })

  // Remove wrong_guesses column
  await knex.schema.alterTable('tier_sessions', (table) => {
    table.dropColumn('wrong_guesses')
  })
}
