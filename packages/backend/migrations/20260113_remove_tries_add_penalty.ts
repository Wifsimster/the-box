import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  // Remove try tracking index
  await knex.schema.alterTable('guesses', (table) => {
    table.dropIndex(['tier_session_id', 'position'], 'guesses_tier_position_idx')
  })

  // Remove try_number column from guesses table
  await knex.schema.alterTable('guesses', (table) => {
    table.dropColumn('try_number')
  })
}

export async function down(knex: Knex): Promise<void> {
  // Restore try_number column
  await knex.schema.alterTable('guesses', (table) => {
    table.integer('try_number').notNullable().defaultTo(1)
  })

  // Restore index for efficient try count lookups
  await knex.schema.alterTable('guesses', (table) => {
    table.index(['tier_session_id', 'position'], 'guesses_tier_position_idx')
  })
}
