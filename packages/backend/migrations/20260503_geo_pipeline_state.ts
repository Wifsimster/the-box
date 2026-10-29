import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('geo_game_pipeline_state', (table) => {
    table
      .integer('game_id')
      .primary()
      .references('id')
      .inTable('games')
      .onDelete('CASCADE')
    table
      .string('current_stage', 30)
      .notNullable()
      .defaultTo('queued')
      .comment('queued | fetching_map | fetching_candidates | awaiting_curation | ready | blocked')
    table
      .string('active_source', 30)
      .nullable()
      .comment('fandom | strategywiki | mapgenie | wand | steam | rawg | manual')
    table.smallint('next_source_idx').notNullable().defaultTo(0)
    table.integer('attempts_total').notNullable().defaultTo(0)
    table.integer('zones_total').notNullable().defaultTo(0)
    table.integer('zones_covered').notNullable().defaultTo(0)
    table.integer('zones_selected').notNullable().defaultTo(0)
    table
      .boolean('needs_curation')
      .notNullable()
      .defaultTo(false)
      .comment('True when fetched maps await admin selection per zone')
    table.timestamp('last_attempt_at', { useTz: true }).nullable()
    table
      .timestamp('next_eligible_at', { useTz: true })
      .nullable()
      .comment('Orchestrator skips this game until now() >= next_eligible_at')
    table
      .timestamp('updated_at', { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now())

    table.index(
      ['current_stage', 'next_eligible_at'],
      'idx_geo_pipeline_state_stage_eligible',
    )
  })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('geo_game_pipeline_state')
}
