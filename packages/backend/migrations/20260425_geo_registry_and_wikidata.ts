import type { Knex } from 'knex'

// Adds support for two additional `geo_map` source tiers alongside the existing
// Fandom Interactive Maps importer:
//
//   * `registry` — curated GitHub repos with permissively-licensed Leaflet
//     world maps (Tier 1, preferred). The registry itself lives at
//     `packages/backend/data/geo-map-registry.json`; this migration only
//     widens the `source` column comment to advertise the new value.
//   * `wikidata` — Wikidata `P242` (locator map image) → Wikimedia Commons
//     image (Tier 2, fallback). Requires a `wikidata_qid` per game so the
//     resolver can look up the locator map without re-running text search
//     on every tick.
//
// Manual admin uploads continue to use `source = 'manual'` — no schema
// change needed there beyond the route added in admin.routes.ts.

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('games', (table) => {
    table
      .string('wikidata_qid', 20)
      .nullable()
      .comment('Wikidata Q-id, e.g. Q3389581 for Elden Ring')
  })

  // Drop tombstones from the old metadata strategy so the resolver gets
  // a clean run with the new wikidata_qid lookup.
  await knex('geo_ingest_failure').where({ source: 'metadata' }).delete()
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('games', (table) => {
    table.dropColumn('wikidata_qid')
  })
}
