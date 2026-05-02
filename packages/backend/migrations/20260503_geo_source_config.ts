import type { Knex } from 'knex'

// Source registry: priority, kind (map vs candidates), and rate limits live in
// the database, not hardcoded enums. Per-game source overrides go on
// `geo_game_pipeline_state.active_source`. Changing priority becomes one UPDATE
// instead of a deploy.

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('geo_source_config', (table) => {
    table.string('source', 30).primary()
    table
      .string('kind', 20)
      .notNullable()
      .comment('map (Fandom/StrategyWiki/MapGenie/Wand) | candidates (Steam/RAWG)')
    table.smallint('priority').notNullable()
    table.boolean('is_enabled').notNullable().defaultTo(true)
    table.integer('rate_limit_per_min').nullable()
    table
      .integer('cooldown_seconds_on_empty')
      .notNullable()
      .defaultTo(86400)
      .comment('1d default; orchestrator can extend exponentially per attempt')
    table
      .timestamp('updated_at', { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now())
  })

  await knex('geo_source_config').insert([
    { source: 'fandom', kind: 'map', priority: 10, rate_limit_per_min: 120 },
    { source: 'strategywiki', kind: 'map', priority: 20, rate_limit_per_min: 30 },
    { source: 'mapgenie', kind: 'map', priority: 30, rate_limit_per_min: 30 },
    { source: 'wand', kind: 'map', priority: 40, rate_limit_per_min: 30 },
    { source: 'steam', kind: 'candidates', priority: 50, rate_limit_per_min: 60 },
    { source: 'rawg', kind: 'candidates', priority: 60, rate_limit_per_min: 50 },
    { source: 'manual', kind: 'map', priority: 0, rate_limit_per_min: null },
  ])
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('geo_source_config')
}
