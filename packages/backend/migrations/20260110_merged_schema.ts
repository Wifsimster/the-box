import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
    // Enable UUID extension
    await knex.raw('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"')

    // ===== Initial Schema (20260110_initial_schema) =====

    // Better-auth's user table should already exist
    // If not, this migration should be run after: npx @better-auth/cli migrate

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
        // Added in 20260114_add_metacritic_to_games
        table.integer('metacritic').nullable()
        // Added in 20260115_add_rawg_id_and_last_synced
        table.integer('rawg_id').unique().nullable()
        table.timestamp('last_synced_at', { useTz: true }).nullable()
        table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now())

        table.index('name', 'games_name_idx')
        // Added in 20260115_add_rawg_id_and_last_synced
        table.index(['rawg_id'], 'idx_games_rawg_id')
        table.index(['last_synced_at'], 'idx_games_last_synced')
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

    // Game sessions table - using TEXT for user_id to match better-auth
    await knex.schema.createTable('game_sessions', (table) => {
        table.uuid('id').primary().defaultTo(knex.fn.uuid())
        table.text('user_id').notNullable().references('id').inTable('user').onDelete('CASCADE')
        table.integer('daily_challenge_id').notNullable().references('id').inTable('daily_challenges').onDelete('CASCADE')
        table.integer('current_tier').notNullable().defaultTo(1)
        table.integer('current_position').notNullable().defaultTo(1)
        table.integer('total_score').notNullable().defaultTo(0)
        // Added in 20260112_countdown_scoring
        table.integer('initial_score').notNullable().defaultTo(1000)
        table.integer('decay_rate').notNullable().defaultTo(2)
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
        // Added in 20260112_countdown_scoring
        table.integer('session_elapsed_ms')
        // Note: try_number was added in 20260112 but removed in 20260113
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

    // Live event participants table - using TEXT for user_id to match better-auth
    await knex.schema.createTable('live_event_participants', (table) => {
        table.increments('id').primary()
        table.integer('live_event_id').notNullable().references('id').inTable('live_events').onDelete('CASCADE')
        table.text('user_id').notNullable().references('id').inTable('user').onDelete('CASCADE')
        table.uuid('game_session_id').references('id').inTable('game_sessions').onDelete('CASCADE')
        table.timestamp('joined_at', { useTz: true }).notNullable().defaultTo(knex.fn.now())

        table.unique(['live_event_id', 'user_id'], { indexName: 'unique_event_participant' })
    })

    // ===== Import States (20260111_import_states) =====

    await knex.schema.createTable('import_states', (table) => {
        table.increments('id').primary()
        table.string('import_type', 50).notNullable().defaultTo('full-import')
        table.string('status', 50).notNullable().defaultTo('pending')

        // Configuration
        table.integer('batch_size').notNullable().defaultTo(100)
        table.integer('min_metacritic').notNullable().defaultTo(70)
        table.integer('screenshots_per_game').notNullable().defaultTo(3)

        // Progress tracking
        table.integer('total_games_available').nullable()
        table.integer('current_page').notNullable().defaultTo(1)
        table.integer('last_processed_offset').notNullable().defaultTo(0)
        table.integer('games_processed').notNullable().defaultTo(0)
        table.integer('games_imported').notNullable().defaultTo(0)
        table.integer('games_skipped').notNullable().defaultTo(0)
        table.integer('screenshots_downloaded').notNullable().defaultTo(0)
        table.integer('failed_count').notNullable().defaultTo(0)

        // Batch tracking
        table.integer('current_batch').notNullable().defaultTo(0)
        table.integer('total_batches_estimated').nullable()

        // Timestamps
        table.timestamp('started_at').nullable()
        table.timestamp('paused_at').nullable()
        table.timestamp('resumed_at').nullable()
        table.timestamp('completed_at').nullable()
        table.timestamp('created_at').notNullable().defaultTo(knex.fn.now())
        table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now())

        // Index for quick lookup of active imports
        table.index(['status'], 'idx_import_states_status')
    })
}

export async function down(knex: Knex): Promise<void> {
    // Drop tables in reverse order of creation
    await knex.schema.dropTableIfExists('import_states')
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
}
