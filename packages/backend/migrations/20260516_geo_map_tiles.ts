import type { Knex } from 'knex'

// Adds tiled-map support to geo_map. Existing rows stay valid (kind defaults
// to 'image'); a new 'tiles' kind references a Leaflet-style tile pyramid by
// URL template + zoom range + scheme. The CHECK constraint is the invariant
// that prevents half-formed tile rows from sneaking past the worker.
//
// `image_url` stays NOT NULL — tile entries still set it to a representative
// thumbnail (e.g. a single tile from the deepest zoom) so admin grids and
// non-Leaflet renderers keep working without a separate preview pipeline.

const TILE_KIND_CHECK_NAME = 'geo_map_tile_kind_check'

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('geo_map', (table) => {
    table.string('kind', 16).notNullable().defaultTo('image')
    table.text('tile_url_template').nullable()
    table.smallint('tile_min_zoom').nullable()
    table.smallint('tile_max_zoom').nullable()
    table.smallint('tile_size').nullable()
    table.string('tile_scheme', 32).nullable()
  })

  // Backfill is implicit via the column default, but make it explicit so a
  // mid-migration crash leaves the DB in a known state.
  await knex('geo_map').whereNull('kind').update({ kind: 'image' })

  await knex.raw(
    `ALTER TABLE geo_map ADD CONSTRAINT ${TILE_KIND_CHECK_NAME} CHECK (
        (kind = 'image')
        OR (
          kind = 'tiles'
          AND tile_url_template IS NOT NULL
          AND tile_min_zoom IS NOT NULL
          AND tile_max_zoom IS NOT NULL
          AND tile_size IS NOT NULL
          AND tile_scheme IS NOT NULL
          AND tile_min_zoom <= tile_max_zoom
        )
      )`,
  )
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`ALTER TABLE geo_map DROP CONSTRAINT IF EXISTS ${TILE_KIND_CHECK_NAME}`)
  await knex.schema.alterTable('geo_map', (table) => {
    table.dropColumn('tile_scheme')
    table.dropColumn('tile_size')
    table.dropColumn('tile_max_zoom')
    table.dropColumn('tile_min_zoom')
    table.dropColumn('tile_url_template')
    table.dropColumn('kind')
  })
}
