import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('game_sessions', (table) => {
    table.dropColumn('initial_score')
    table.dropColumn('decay_rate')
  })

  await knex.schema.alterTable('tier_sessions', (table) => {
    table.integer('wrong_guesses').notNullable().defaultTo(0)
  })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('game_sessions', (table) => {
    table.integer('initial_score').notNullable().defaultTo(1000)
    table.integer('decay_rate').notNullable().defaultTo(2)
  })

  await knex.schema.alterTable('tier_sessions', (table) => {
    table.dropColumn('wrong_guesses')
  })
}
