import type { Knex } from 'knex'

// Auto-ingestion support for the Geo Game dataset. Replaces the manual admin
// forms (typed wiki subdomain / Steam app id / page title) with a curated-set
// model where:
//   - operators flip `games.geo_curated = true` for games to onboard,
//   - a recurring resolver fills in `steam_app_id` / `wiki_subdomain` /
//     `wiki_page_title` from heuristics (Steam storesearch, Fandom HEAD),
//   - a recurring tick enqueues per-game Fandom + Steam imports,
//   - permanent failures land in `geo_ingest_failure` so we stop retrying.
//
// All additions are nullable / defaulted so existing rows stay valid.

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('games', (table) => {
    table.integer('steam_app_id').nullable()
    table.string('wiki_subdomain', 100).nullable()
    table.string('wiki_page_title', 200).nullable()
    table
      .string('geo_metadata_status', 20)
      .notNullable()
      .defaultTo('pending')
      .comment('pending | resolved | unresolved')
    table.boolean('geo_curated').notNullable().defaultTo(false)
    table.timestamp('geo_metadata_resolved_at', { useTz: true }).nullable()

    table.index(['geo_curated', 'geo_metadata_status'], 'idx_games_geo_curation')
  })

  await knex.schema.createTable('geo_ingest_failure', (table) => {
    table
      .integer('game_id')
      .notNullable()
      .references('id')
      .inTable('games')
      .onDelete('CASCADE')
    table.string('source', 30).notNullable().comment('fandom | steam | metadata')
    table.string('reason', 500).notNullable()
    table.integer('attempt_count').notNullable().defaultTo(1)
    table
      .timestamp('last_attempt_at', { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now())
    table
      .timestamp('retry_after', { useTz: true })
      .notNullable()
      .comment('Tick skips this game/source until now() >= retry_after')

    table.primary(['game_id', 'source'])
    table.index('retry_after', 'idx_geo_ingest_failure_retry_after')
  })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('geo_ingest_failure')
  await knex.schema.alterTable('games', (table) => {
    table.dropIndex(['geo_curated', 'geo_metadata_status'], 'idx_games_geo_curation')
    table.dropColumn('geo_metadata_resolved_at')
    table.dropColumn('geo_curated')
    table.dropColumn('geo_metadata_status')
    table.dropColumn('wiki_page_title')
    table.dropColumn('wiki_subdomain')
    table.dropColumn('steam_app_id')
  })
}
