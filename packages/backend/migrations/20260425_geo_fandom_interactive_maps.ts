import type { Knex } from 'knex'

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

  await knex('geo_ingest_failure').where({ source: 'metadata' }).delete()
  await knex('geo_ingest_failure').where({ source: 'fandom' }).delete()
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('geo_map', (table) => {
    table.dropColumn('wiki_revision_id')
    table.dropColumn('wiki_map_name')
  })
}
