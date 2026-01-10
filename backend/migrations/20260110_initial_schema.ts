import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  // Enable UUID extension
  await knex.raw('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"')

  // Users table
  await knex.schema.createTable('users', (table) => {
    table.uuid('id').primary().defaultTo(knex.fn.uuid())
    table.string('username', 50).unique().notNullable()
    table.string('email', 255).unique().notNullable()
    table.string('password_hash', 255).notNullable()
    table.string('display_name', 100)
    table.string('avatar_url', 500)
    table.boolean('is_guest').notNullable().defaultTo(false)
    table.boolean('is_admin').notNullable().defaultTo(false)
    table.integer('total_score').notNullable().defaultTo(0)
    table.integer('current_streak').notNullable().defaultTo(0)
    table.integer('longest_streak').notNullable().defaultTo(0)
    table.timestamp('last_played_at', { useTz: true })
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now())
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now())
  })

  // Games table
  await knex.schema.createTable('games', (table) => {
    table.increments('id').primary()
    table.string('name', 255).notNullable()
    table.string('slug', 255).unique().notNullable()
    table.specificType('aliases', 'text[]')
    table.integer('release_year')
    table.string('developer', 255)
    table.string('publisher', 255)
    table.specificType('genres', 'text[]')
    table.specificType('platforms', 'text[]')
    table.string('cover_image_url', 500)
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now())

    table.index('name', 'games_name_idx')
  })

  // Screenshots table
  await knex.schema.createTable('screenshots', (table) => {
    table.increments('id').primary()
    table.integer('game_id').notNullable().references('id').inTable('games').onDelete('CASCADE')
    table.string('image_url', 500).notNullable()
    table.string('thumbnail_url', 500)
    table.integer('haov').notNullable().defaultTo(180)
    table.integer('vaov').notNullable().defaultTo(90)
    table.integer('difficulty').notNullable().defaultTo(2)
    table.string('location_hint', 255)
    table.boolean('is_active').notNullable().defaultTo(true)
    table.integer('times_used').notNullable().defaultTo(0)
    table.integer('correct_guesses').notNullable().defaultTo(0)
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now())
  })

  // Daily challenges table
  await knex.schema.createTable('daily_challenges', (table) => {
    table.increments('id').primary()
    table.date('challenge_date').unique().notNullable()
    table.boolean('is_active').notNullable().defaultTo(true)
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now())
  })

  // Tiers table
  await knex.schema.createTable('tiers', (table) => {
    table.increments('id').primary()
    table.integer('daily_challenge_id').notNullable().references('id').inTable('daily_challenges').onDelete('CASCADE')
    table.integer('tier_number').notNullable()
    table.string('name', 50).notNullable()
    table.integer('time_limit_seconds').notNullable().defaultTo(30)
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now())

    table.unique(['daily_challenge_id', 'tier_number'], { indexName: 'unique_tier' })
  })

  // Tier screenshots table
  await knex.schema.createTable('tier_screenshots', (table) => {
    table.increments('id').primary()
    table.integer('tier_id').notNullable().references('id').inTable('tiers').onDelete('CASCADE')
    table.integer('screenshot_id').notNullable().references('id').inTable('screenshots').onDelete('CASCADE')
    table.integer('position').notNullable()
    table.decimal('bonus_multiplier', 3, 2).notNullable().defaultTo(1.0)
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now())

    table.unique(['tier_id', 'position'], { indexName: 'unique_tier_position' })
  })

  // Game sessions table
  await knex.schema.createTable('game_sessions', (table) => {
    table.uuid('id').primary().defaultTo(knex.fn.uuid())
    table.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE')
    table.integer('daily_challenge_id').notNullable().references('id').inTable('daily_challenges').onDelete('CASCADE')
    table.integer('current_tier').notNullable().defaultTo(1)
    table.integer('current_position').notNullable().defaultTo(1)
    table.integer('total_score').notNullable().defaultTo(0)
    table.boolean('is_completed').notNullable().defaultTo(false)
    table.timestamp('started_at', { useTz: true }).notNullable().defaultTo(knex.fn.now())
    table.timestamp('completed_at', { useTz: true })

    table.unique(['user_id', 'daily_challenge_id'], { indexName: 'unique_user_challenge' })
  })

  // Tier sessions table
  await knex.schema.createTable('tier_sessions', (table) => {
    table.uuid('id').primary().defaultTo(knex.fn.uuid())
    table.uuid('game_session_id').notNullable().references('id').inTable('game_sessions').onDelete('CASCADE')
    table.integer('tier_id').notNullable().references('id').inTable('tiers').onDelete('CASCADE')
    table.integer('score').notNullable().defaultTo(0)
    table.integer('correct_answers').notNullable().defaultTo(0)
    table.boolean('is_completed').notNullable().defaultTo(false)
    table.timestamp('started_at', { useTz: true }).notNullable().defaultTo(knex.fn.now())
    table.timestamp('completed_at', { useTz: true })
  })

  // Guesses table
  await knex.schema.createTable('guesses', (table) => {
    table.increments('id').primary()
    table.uuid('tier_session_id').notNullable().references('id').inTable('tier_sessions').onDelete('CASCADE')
    table.integer('screenshot_id').notNullable().references('id').inTable('screenshots')
    table.integer('position').notNullable()
    table.integer('guessed_game_id').references('id').inTable('games')
    table.string('guessed_text', 255)
    table.boolean('is_correct').notNullable()
    table.integer('time_taken_ms').notNullable()
    table.integer('score_earned').notNullable().defaultTo(0)
    table.string('power_up_used', 50)
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now())
  })

  // Power-ups table
  await knex.schema.createTable('power_ups', (table) => {
    table.increments('id').primary()
    table.uuid('tier_session_id').notNullable().references('id').inTable('tier_sessions').onDelete('CASCADE')
    table.string('power_up_type', 50).notNullable()
    table.boolean('is_used').notNullable().defaultTo(false)
    table.integer('earned_at_round')
    table.integer('used_at_round')
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now())
  })

  // Bonus rounds table
  await knex.schema.createTable('bonus_rounds', (table) => {
    table.increments('id').primary()
    table.uuid('tier_session_id').notNullable().references('id').inTable('tier_sessions').onDelete('CASCADE')
    table.integer('after_position').notNullable()
    table.string('power_up_won', 50)
    table.integer('time_taken_ms')
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now())
  })

  // Live events table
  await knex.schema.createTable('live_events', (table) => {
    table.increments('id').primary()
    table.integer('daily_challenge_id').notNullable().references('id').inTable('daily_challenges').onDelete('CASCADE')
    table.string('name', 255).notNullable()
    table.timestamp('scheduled_at', { useTz: true }).notNullable()
    table.integer('duration_minutes').notNullable().defaultTo(60)
    table.boolean('is_active').notNullable().defaultTo(true)
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now())
  })

  // Live event participants table
  await knex.schema.createTable('live_event_participants', (table) => {
    table.increments('id').primary()
    table.integer('live_event_id').notNullable().references('id').inTable('live_events').onDelete('CASCADE')
    table.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE')
    table.uuid('game_session_id').references('id').inTable('game_sessions').onDelete('CASCADE')
    table.timestamp('joined_at', { useTz: true }).notNullable().defaultTo(knex.fn.now())

    table.unique(['live_event_id', 'user_id'], { indexName: 'unique_event_participant' })
  })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('live_event_participants')
  await knex.schema.dropTableIfExists('live_events')
  await knex.schema.dropTableIfExists('bonus_rounds')
  await knex.schema.dropTableIfExists('power_ups')
  await knex.schema.dropTableIfExists('guesses')
  await knex.schema.dropTableIfExists('tier_sessions')
  await knex.schema.dropTableIfExists('game_sessions')
  await knex.schema.dropTableIfExists('tier_screenshots')
  await knex.schema.dropTableIfExists('tiers')
  await knex.schema.dropTableIfExists('daily_challenges')
  await knex.schema.dropTableIfExists('screenshots')
  await knex.schema.dropTableIfExists('games')
  await knex.schema.dropTableIfExists('users')
}
