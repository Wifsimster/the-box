import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('geo_map', (table) => {
    table
      .boolean('is_capture_default')
      .notNullable()
      .defaultTo(false)
      .comment(
        'When true, Steam/RAWG capture providers attach new candidates to this map. At most one row per game_id may be true.',
      )
  })

  await knex.raw(`
    CREATE UNIQUE INDEX geo_map_one_capture_default_per_game
    ON geo_map (game_id)
    WHERE is_capture_default = true
  `)

  await knex.raw(`
    UPDATE geo_map
    SET is_capture_default = true
    WHERE id IN (
      SELECT DISTINCT ON (game_id) id
      FROM geo_map
      WHERE is_active = true
      ORDER BY game_id, created_at DESC
    )
  `)

  await knex.schema.alterTable('geo_guess', (table) => {
    table
      .integer('geo_map_id_picked')
      .nullable()
      .references('id')
      .inTable('geo_map')
      .onDelete('SET NULL')
      .comment(
        'Map the player picked from the chooser. NULL for legacy rows recorded before multi-map shipped.',
      )
  })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('geo_guess', (table) => {
    table.dropColumn('geo_map_id_picked')
  })
  await knex.raw('DROP INDEX IF EXISTS geo_map_one_capture_default_per_game')
  await knex.schema.alterTable('geo_map', (table) => {
    table.dropColumn('is_capture_default')
  })
}
