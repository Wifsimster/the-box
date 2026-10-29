import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('geogamers_challenge', (table) => {
    table.increments('id').primary()
    table.date('challenge_date').notNullable().unique()
    table
      .integer('geo_screenshot_meta_id')
      .notNullable()
      .references('id')
      .inTable('geo_screenshot_meta')
      .onDelete('RESTRICT')
    table.boolean('is_current').notNullable().defaultTo(false)
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now())

    table.index('challenge_date')
  })

  await knex.raw(`
    CREATE UNIQUE INDEX geogamers_challenge_one_current
    ON geogamers_challenge (is_current)
    WHERE is_current = true
  `)

  await knex.schema.createTable('geogamers_run', (table) => {
    table.increments('id').primary()
    table
      .integer('geogamers_challenge_id')
      .notNullable()
      .references('id')
      .inTable('geogamers_challenge')
      .onDelete('CASCADE')
    table.text('user_id').nullable().references('id').inTable('user').onDelete('CASCADE')
    table.text('anonymous_session_id').nullable().comment('Set for guest runs; null once claimed into an account')
    table
      .integer('geo_screenshot_meta_id')
      .nullable()
      .references('id')
      .inTable('geo_screenshot_meta')
      .onDelete('RESTRICT')
    table.uuid('run_token').notNullable().unique().comment('Single-use, server-issued; addresses a run without leaking meta id')
    table.jsonb('game_attempts').notNullable().defaultTo('[]').comment('GeoGamersGameAttempt[]')
    table.integer('game_points').nullable().comment('100 / 66 / 33 / 0, locked at phase-1 resolve')
    table.float('guess_x').nullable()
    table.float('guess_y').nullable()
    table.float('distance').nullable().comment('Normalized [0..1] distance to canonical')
    table.integer('location_points').nullable().comment('0..100')
    table.integer('total_points').nullable().comment('game_points + location_points, 0..200')
    table.integer('score_version').nullable().comment('Bump on formula retune for fairness')
    table.integer('time_spent_ms').notNullable().defaultTo(0)
    table.timestamp('started_at', { useTz: true }).notNullable().defaultTo(knex.fn.now())
    table.timestamp('completed_at', { useTz: true }).nullable().comment('Set once both phases scored; used for claim timing-plausibility')
    table.boolean('joker_used').notNullable().defaultTo(false)
    table.timestamp('claimed_at', { useTz: true }).nullable()
    table.text('claimed_by_user_id').nullable().references('id').inTable('user').onDelete('SET NULL')

    table.index('geogamers_challenge_id')
    table.index('run_token')
    table.index('anonymous_session_id')
  })

  await knex.raw(`
    CREATE UNIQUE INDEX geogamers_run_user_challenge
    ON geogamers_run (user_id, geogamers_challenge_id)
    WHERE user_id IS NOT NULL
  `)

  await knex.raw(`
    CREATE INDEX geogamers_run_season
    ON geogamers_run (user_id, completed_at)
    WHERE user_id IS NOT NULL AND completed_at IS NOT NULL
  `)

  await knex.raw(`
    CREATE UNIQUE INDEX geogamers_run_claim_once
    ON geogamers_run (claimed_by_user_id, geogamers_challenge_id)
    WHERE claimed_by_user_id IS NOT NULL
  `)

  await knex.schema.createTable('geogamers_joker', (table) => {
    table.text('user_id').notNullable().references('id').inTable('user').onDelete('CASCADE')
    table.string('season_month', 7).notNullable().comment('YYYY-MM (UTC)')
    table
      .integer('geogamers_challenge_id')
      .notNullable()
      .references('id')
      .inTable('geogamers_challenge')
      .onDelete('CASCADE')
    table
      .integer('rerolled_geo_screenshot_meta_id')
      .notNullable()
      .references('id')
      .inTable('geo_screenshot_meta')
      .onDelete('RESTRICT')
    table.timestamp('used_at', { useTz: true }).notNullable().defaultTo(knex.fn.now())

    table.primary(['user_id', 'season_month'])
  })

  await knex.schema.createTable('geogamers_season', (table) => {
    table.string('month', 7).primary().comment('YYYY-MM')
    table.integer('dropped_worst_count').notNullable().defaultTo(3)
    table.integer('min_days_for_drop').notNullable().defaultTo(10)
    table.timestamp('finalized_at', { useTz: true }).nullable()
    table.jsonb('final_standings').nullable().comment('Frozen GeoGamersSeasonStanding[] snapshot')
  })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('geogamers_season')
  await knex.schema.dropTableIfExists('geogamers_joker')
  await knex.raw('DROP INDEX IF EXISTS geogamers_run_claim_once')
  await knex.raw('DROP INDEX IF EXISTS geogamers_run_season')
  await knex.raw('DROP INDEX IF EXISTS geogamers_run_user_challenge')
  await knex.schema.dropTableIfExists('geogamers_run')
  await knex.raw('DROP INDEX IF EXISTS geogamers_challenge_one_current')
  await knex.schema.dropTableIfExists('geogamers_challenge')
}
