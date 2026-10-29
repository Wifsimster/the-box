import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
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
