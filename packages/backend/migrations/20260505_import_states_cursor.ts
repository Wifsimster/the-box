import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('import_states', (table) => {
    table.jsonb('cursor').nullable()
  })

  await knex.raw(`
    UPDATE import_states
    SET cursor = jsonb_build_object('last_processed_offset', last_processed_offset)
    WHERE last_processed_offset IS NOT NULL
  `)
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('import_states', (table) => {
    table.dropColumn('cursor')
  })
}
