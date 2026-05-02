import type { Knex } from 'knex'

// `last_processed_offset` is overloaded — sometimes a game_id, sometimes a
// page number, depending on the import_type. Replace with a self-describing
// JSONB cursor that each import job interprets per its own schema.
//
// Backfill copies the integer value into `cursor.last_processed_offset` so
// in-flight imports keep their place. The column is dropped in a follow-up
// release once all callers are migrated.

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
