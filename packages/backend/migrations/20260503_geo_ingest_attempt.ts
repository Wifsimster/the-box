import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('geo_ingest_attempt', (table) => {
    table.bigIncrements('id').primary()
    table
      .integer('game_id')
      .notNullable()
      .references('id')
      .inTable('games')
      .onDelete('CASCADE')
    table
      .string('source', 30)
      .notNullable()
      .comment('fandom | strategywiki | mapgenie | wand | steam | rawg | manual')
    table
      .string('attempt_kind', 20)
      .notNullable()
      .comment('map | candidates')
    table
      .string('outcome', 30)
      .notNullable()
      .comment('success | not_found | rate_limited | parse_error | http_5xx | http_4xx | timeout | empty')
    table.smallint('http_status').nullable()
    table.string('error_code', 50).nullable()
    table.jsonb('error_detail').nullable()
    table.integer('items_ingested').notNullable().defaultTo(0)
    table.integer('latency_ms').nullable()
    table.string('correlation_id', 64).nullable()
    table
      .timestamp('attempted_at', { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now())

    table.index(
      ['game_id', 'source', 'attempted_at'],
      'idx_geo_ingest_attempt_game_source_time',
    )
    table.index(
      ['game_id', 'source', 'outcome', 'attempted_at'],
      'idx_geo_ingest_attempt_cooldown_query',
    )
  })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('geo_ingest_attempt')
}
