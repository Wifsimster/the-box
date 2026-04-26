import type { Knex } from 'knex'

// User-driven reporting of ineligible captures (screenshots).
// A report can target either a main `screenshots` row or a `geo_screenshot_candidate`
// row (geo-only sources like Steam imports that don't live in `screenshots`).
// Once enough unique users report the same target, the corresponding row is
// flagged inactive and excluded from all selection queries (geo + daily game).

export async function up(knex: Knex): Promise<void> {
  // Geo candidates need their own active flag; the main screenshots table
  // already has `is_active` which the daily-challenge picker honors.
  await knex.schema.alterTable('geo_screenshot_candidate', (table) => {
    table.boolean('is_active').notNullable().defaultTo(true)
  })

  await knex.schema.createTable('screenshot_reports', (table) => {
    table.increments('id').primary()
    table.text('user_id').notNullable().references('id').inTable('user').onDelete('CASCADE')
    table
      .integer('screenshot_id')
      .nullable()
      .references('id')
      .inTable('screenshots')
      .onDelete('CASCADE')
    table
      .integer('geo_screenshot_candidate_id')
      .nullable()
      .references('id')
      .inTable('geo_screenshot_candidate')
      .onDelete('CASCADE')
    table
      .string('reason', 50)
      .notNullable()
      .comment('wrong_game | low_quality | not_recognizable | inappropriate | too_easy | other')
    table.text('details').nullable()
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now())

    table.index('screenshot_id')
    table.index('geo_screenshot_candidate_id')
  })

  // Enforce "exactly one of (screenshot_id, geo_screenshot_candidate_id) is set"
  // and prevent the same user from reporting the same target twice.
  await knex.raw(`
    ALTER TABLE screenshot_reports
    ADD CONSTRAINT screenshot_reports_target_exclusive
    CHECK (
      (screenshot_id IS NOT NULL AND geo_screenshot_candidate_id IS NULL)
      OR
      (screenshot_id IS NULL AND geo_screenshot_candidate_id IS NOT NULL)
    )
  `)

  await knex.raw(`
    CREATE UNIQUE INDEX screenshot_reports_unique_screenshot_user
    ON screenshot_reports (user_id, screenshot_id)
    WHERE screenshot_id IS NOT NULL
  `)

  await knex.raw(`
    CREATE UNIQUE INDEX screenshot_reports_unique_geo_candidate_user
    ON screenshot_reports (user_id, geo_screenshot_candidate_id)
    WHERE geo_screenshot_candidate_id IS NOT NULL
  `)
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('screenshot_reports')
  await knex.schema.alterTable('geo_screenshot_candidate', (table) => {
    table.dropColumn('is_active')
  })
}
