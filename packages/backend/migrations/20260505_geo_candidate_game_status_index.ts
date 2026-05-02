import type { Knex } from 'knex'

// Composite index supporting the per-game moderation summary
// (`/api/admin/geo/candidates/by-game`). The summary does
// `GROUP BY game_id` with `COUNT(*) FILTER (WHERE status = ...)`,
// so an index leading on game_id and including status keeps the
// aggregation index-only as the candidate table grows.

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
