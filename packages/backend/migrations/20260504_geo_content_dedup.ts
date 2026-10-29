import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('geo_screenshot_candidate', (table) => {
    table.specificType('content_sha256', 'CHAR(64)').nullable()
    table.bigInteger('perceptual_hash').nullable()
  })
  await knex.raw(`
    CREATE UNIQUE INDEX geo_screenshot_candidate_unique_content
    ON geo_screenshot_candidate (game_id, content_sha256)
    WHERE content_sha256 IS NOT NULL
  `)

  await knex.schema.alterTable('geo_map', (table) => {
    table.specificType('content_sha256', 'CHAR(64)').nullable()
  })
  await knex.raw(`
    CREATE UNIQUE INDEX geo_map_unique_content
    ON geo_map (game_id, content_sha256)
    WHERE content_sha256 IS NOT NULL
  `)
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw('DROP INDEX IF EXISTS geo_map_unique_content')
  await knex.schema.alterTable('geo_map', (table) => {
    table.dropColumn('content_sha256')
  })
  await knex.raw('DROP INDEX IF EXISTS geo_screenshot_candidate_unique_content')
  await knex.schema.alterTable('geo_screenshot_candidate', (table) => {
    table.dropColumn('perceptual_hash')
    table.dropColumn('content_sha256')
  })
}
