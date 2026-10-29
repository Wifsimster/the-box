import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  const hasColumn = await knex.schema.hasColumn('user', 'country')
  if (!hasColumn) {
    await knex.schema.alterTable('user', (table) => {
      table.string('country', 2).nullable()
    })
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasColumn = await knex.schema.hasColumn('user', 'country')
  if (hasColumn) {
    await knex.schema.alterTable('user', (table) => {
      table.dropColumn('country')
    })
  }
}
