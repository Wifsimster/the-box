import type { Knex } from 'knex'

// Per-game capture count was raised from 3 to 5. The column default backs new
// import-state rows when the API caller doesn't supply a value, so it has to
// move with the application code.

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
