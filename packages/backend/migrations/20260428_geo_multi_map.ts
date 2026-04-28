import type { Knex } from 'knex'

// Multi-map per game: a single game can now have N enabled `geo_map` rows
// (e.g. BG3 → Nautiloid + Wilderness + Shadow-Cursed Lands + Baldur's Gate).
//
// Schema-level changes are minimal because the existing model already
// references one map per candidate / meta. What changes:
//
//   1. `geo_map.is_capture_default` — exactly one map per game can be the
//      default target for Steam/RAWG capture. The ingest tick used to read
//      `is_active = true` for that role; with multi-map that's ambiguous,
//      so capture targeting moves to its own column. Backfilled from the
//      currently-active row per game so single-map games keep behaving
//      identically.
//
//   2. `geo_guess.geo_map_id_picked` — records which map the player chose
//      from the chooser. Lets us answer "how often do players pick the
//      wrong map?" without bolting on a side table later. Nullable for
//      backwards compatibility with rows recorded before the chooser
//      shipped.

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

  // Partial unique index instead of a full unique constraint so most rows
  // (false) don't conflict with each other.
  await knex.raw(`
    CREATE UNIQUE INDEX geo_map_one_capture_default_per_game
    ON geo_map (game_id)
    WHERE is_capture_default = true
  `)

  // Backfill: every game that has at least one active map gets exactly one
  // capture-default — picking the most-recently-created active row, which
  // matches the row `findActiveByGameId` would have returned.
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
