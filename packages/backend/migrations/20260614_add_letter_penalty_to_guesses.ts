import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('guesses', (table) => {
    table.integer('letter_penalty').notNullable().defaultTo(0)
  })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('guesses', (table) => {
    table.dropColumn('letter_penalty')
  })
}
