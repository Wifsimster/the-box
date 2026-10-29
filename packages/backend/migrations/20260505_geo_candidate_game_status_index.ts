import type { Knex } from 'knex'

const INDEX_NAME = 'geo_screenshot_candidate_game_id_status_idx'

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('geo_screenshot_candidate', (table) => {
    table.index(['game_id', 'status'], INDEX_NAME)
  })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('geo_screenshot_candidate', (table) => {
    table.dropIndex(['game_id', 'status'], INDEX_NAME)
  })
}
