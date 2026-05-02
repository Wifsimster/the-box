import type { Knex } from 'knex'

// A game has N zones, each needs its own map (Hyrule Field, Death Mountain,
// etc.). Multi-map providers (MapGenie, Wand, Fandom) emit one row per zone.
// Admin curates by flipping `is_selected` on exactly one map per (game, zone).
//
// `is_capture_default` is superseded by `is_selected` and dropped here:
// "the chosen map for this zone" is the only relevant role going forward.
// Single-zone games use NULL `zone_slug`.

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('geo_map', (table) => {
    table
      .string('zone_name', 200)
      .nullable()
      .comment('Human-readable zone name. NULL for single-zone games.')
    table
      .string('zone_slug', 200)
      .nullable()
      .comment('Normalized zone key for matching across providers')
    table
      .string('provider', 30)
      .nullable()
      .comment('fandom | strategywiki | mapgenie | wand | manual; backfilled from source')
    table.boolean('is_selected').notNullable().defaultTo(false)
    table.text('selected_by').nullable().references('id').inTable('user').onDelete('SET NULL')
    table.timestamp('selected_at', { useTz: true }).nullable()
  })

  // Backfill provider from existing source column.
  await knex.raw(`UPDATE geo_map SET provider = source WHERE provider IS NULL`)

  // Carry over the existing capture-default rows as the initial selection so
  // single-map games keep working without manual curation.
  await knex.raw(`
    UPDATE geo_map
    SET is_selected = true, selected_at = now()
    WHERE is_capture_default = true AND is_active = true
  `)

  // Exactly one selected map per (game, zone). NULL zone_slug treated as a
  // single bucket, which is what we want for legacy single-zone games.
  await knex.raw(`
    CREATE UNIQUE INDEX geo_map_one_selected_per_zone
    ON geo_map (game_id, COALESCE(zone_slug, ''))
    WHERE is_selected = true
  `)
  await knex.raw(`CREATE INDEX idx_geo_map_game_active ON geo_map (game_id, is_active)`)

  // is_capture_default replaced by is_selected. Drop the column and its index.
  await knex.raw('DROP INDEX IF EXISTS geo_map_one_capture_default_per_game')
  await knex.schema.alterTable('geo_map', (table) => {
    table.dropColumn('is_capture_default')
  })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('geo_map', (table) => {
    table.boolean('is_capture_default').notNullable().defaultTo(false)
  })
  await knex.raw(`
    CREATE UNIQUE INDEX geo_map_one_capture_default_per_game
    ON geo_map (game_id)
    WHERE is_capture_default = true
  `)
  await knex.raw(`UPDATE geo_map SET is_capture_default = is_selected`)

  await knex.raw('DROP INDEX IF EXISTS idx_geo_map_game_active')
  await knex.raw('DROP INDEX IF EXISTS geo_map_one_selected_per_zone')
  await knex.schema.alterTable('geo_map', (table) => {
    table.dropColumn('selected_at')
    table.dropColumn('selected_by')
    table.dropColumn('is_selected')
    table.dropColumn('provider')
    table.dropColumn('zone_slug')
    table.dropColumn('zone_name')
  })
}
