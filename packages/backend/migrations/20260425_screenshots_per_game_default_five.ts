import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('import_states', (table) => {
    table.integer('screenshots_per_game').notNullable().defaultTo(5).alter()
  })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('import_states', (table) => {
    table.integer('screenshots_per_game').notNullable().defaultTo(3).alter()
  })
}
