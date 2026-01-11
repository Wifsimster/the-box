import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('games', (table) => {
    table.integer('metacritic').nullable()
  })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('games', (table) => {
    table.dropColumn('metacritic')
  })
}
