import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('game_sessions', (table) => {
    table.boolean('streak_bonus_enabled').notNullable().defaultTo(false)
    table.integer('streak_bonus_total').notNullable().defaultTo(0)
  })
  await knex.schema.alterTable('game_sessions', (table) => {
    table.boolean('streak_bonus_enabled').notNullable().defaultTo(true).alter()
  })
  await knex.schema.alterTable('guesses', (table) => {
    table.integer('streak_bonus').notNullable().defaultTo(0)
  })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('guesses', (table) => {
    table.dropColumn('streak_bonus')
  })
  await knex.schema.alterTable('game_sessions', (table) => {
    table.dropColumn('streak_bonus_enabled')
    table.dropColumn('streak_bonus_total')
  })
}
