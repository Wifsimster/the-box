import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  const hasColumn = await knex.schema.hasColumn('user', 'selected_theme')
  if (!hasColumn) {
    await knex.schema.alterTable('user', (table) => {
      table.string('selected_theme', 32).notNullable().defaultTo('default')
    })
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasColumn = await knex.schema.hasColumn('user', 'selected_theme')
  if (hasColumn) {
    await knex.schema.alterTable('user', (table) => {
      table.dropColumn('selected_theme')
    })
  }
}
