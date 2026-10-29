import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('geo_map', (table) => {
    table
      .string('region', 100)
      .nullable()
      .comment(
        'Optional region label for multi-map games (e.g. "Velen", "Act II"). NULL = canonical/world map.',
      )
  })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('geo_map', (table) => {
    table.dropColumn('region')
  })
}
