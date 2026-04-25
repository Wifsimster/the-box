import type { Knex } from 'knex'

// Switches the Fandom map importer from scraping arbitrary `prop=images`
// attachments off random wiki pages to the structured Fandom Interactive
// Maps feature (namespace 2900, `Map:`). Two new columns track the source
// map identity for re-resolution and change detection.
//
// Also resets curated games whose `wiki_page_title` was filled in by the
// previous heuristic resolver (Interactive_Map / World_Map / Map / Maps /
// Atlas) — those values are not real `Map:` page names, so the new
// resolver must run again to discover the actual interactive map.

const LEGACY_PAGE_TITLES = ['Interactive_Map', 'World_Map', 'Map', 'Maps', 'Atlas']

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('geo_map', (table) => {
    table
      .string('wiki_map_name', 200)
      .nullable()
      .comment('Fandom Map: page title without the namespace prefix')
    table
      .bigInteger('wiki_revision_id')
      .nullable()
      .comment('Fandom map JSON revisionId at import time, for change detection')
  })

  await knex('games')
    .whereIn('wiki_page_title', LEGACY_PAGE_TITLES)
    .update({
      wiki_page_title: null,
      geo_metadata_status: 'pending',
      geo_metadata_resolved_at: null,
    })

  // Drop tombstones from the previous metadata strategy so the resolver
  // gets a clean run with the Map: namespace lookup.
  await knex('geo_ingest_failure').where({ source: 'metadata' }).delete()
  await knex('geo_ingest_failure').where({ source: 'fandom' }).delete()
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('geo_map', (table) => {
    table.dropColumn('wiki_revision_id')
    table.dropColumn('wiki_map_name')
  })
}
