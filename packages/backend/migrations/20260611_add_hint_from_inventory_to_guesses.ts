import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('guesses', (table) => {
    table.boolean('hint_from_inventory').notNullable().defaultTo(false)
  })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('guesses', (table) => {
    table.dropColumn('hint_from_inventory')
  })
}
