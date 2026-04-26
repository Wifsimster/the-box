import type { Knex } from 'knex'

// Optional region label for `geo_map`, supporting games whose world is
// natively split (Witcher 3 has Velen / Skellige / Toussaint, BG3 has
// Acts I / II / III, Diablo II has Acts I–V). NULL = canonical / world
// map (today's behaviour for every existing row).
//
// At the moment the runtime still only resolves a single `is_active = true`
// row per game via `geoMapRepository.findActiveByGameId`, so this column
// is informational. It exists so that:
//   - the registry / manual upload can record which slice of a game a
//     map represents (admins can see it in the Cartes side panel),
//   - a future "true multi-map" mode can read the column without
//     another migration.

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
