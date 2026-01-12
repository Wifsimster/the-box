import type { Knex } from 'knex'
import { randomBytes } from 'crypto'
// @ts-ignore - from better-auth's dependency
import { scryptAsync } from '@noble/hashes/scrypt.js'

/**
 * Hash password using the same algorithm as better-auth.
 * Matches: N=16384, r=16, p=1, dkLen=64
 * Format: salt:key (both hex encoded)
 */
async function hashPassword(password: string): Promise<string> {
    const saltBytes = randomBytes(16)
    const salt = saltBytes.toString('hex')
    const key = await scryptAsync(password.normalize('NFKC'), salt, {
        N: 16384,
        r: 16,
        p: 1,
        dkLen: 64,
        maxmem: 128 * 16384 * 16 * 2, // 64 MB
    })
    return `${salt}:${Buffer.from(key).toString('hex')}`
}

export async function up(knex: Knex): Promise<void> {
    // Enable UUID extension
    await knex.raw('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"')

    // ===== Better-Auth Tables =====
    // Authentication tables for better-auth with custom game fields

    // Users table (singular 'user' as required by better-auth)
    // Using camelCase for Better Auth standard columns (requires double quotes in PostgreSQL)
    await knex.schema.createTable('user', (table) => {
        table.text('id').primary()
        table.text('email').notNullable().unique()
        table.text('name')
        table.text('image')

        // Plugin: username
        table.text('username').unique()
        table.text('display_username').unique()
        table.timestamp('username_updated_at', { useTz: true })

        // Plugin: admin
        table.text('role').notNullable().defaultTo('user')
        table.boolean('banned').notNullable().defaultTo(false)
        table.text('ban_reason')
        table.timestamp('ban_expires', { useTz: true })

        // Plugin: anonymous - using camelCase to match better-auth expectations
        // Note: PostgreSQL requires double quotes for camelCase column names

        // Additional fields from auth config
        table.text('display_name')
        table.text('avatar_url')
        table.integer('total_score').notNullable().defaultTo(0)
        table.integer('current_streak').notNullable().defaultTo(0)
        table.integer('longest_streak').notNullable().defaultTo(0)
        table.timestamp('last_played_at', { useTz: true })
    })

    // Add Better Auth standard columns with camelCase (requires double quotes)
    await knex.raw(`
        DO $$ 
        BEGIN
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user' AND column_name = 'emailVerified') THEN
                ALTER TABLE "user" ADD COLUMN "emailVerified" BOOLEAN NOT NULL DEFAULT false;
            END IF;
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user' AND column_name = 'createdAt') THEN
                ALTER TABLE "user" ADD COLUMN "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW();
            END IF;
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user' AND column_name = 'updatedAt') THEN
                ALTER TABLE "user" ADD COLUMN "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW();
            END IF;
            -- Handle isAnonymous column: rename from is_anonymous if it exists, otherwise create it
            IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user' AND column_name = 'is_anonymous') THEN
                ALTER TABLE "user" RENAME COLUMN is_anonymous TO "isAnonymous";
            ELSIF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user' AND column_name = 'isAnonymous') THEN
                ALTER TABLE "user" ADD COLUMN "isAnonymous" BOOLEAN NOT NULL DEFAULT false;
            END IF;
        END $$;
    `)

    // Sessions table
    // Using camelCase for Better Auth standard columns
    await knex.schema.createTable('session', (table) => {
        table.text('id').primary()
        table.text('token').notNullable().unique()

        // Plugin: anonymous
        table.text('anonymous_id')
    })

    // Add Better Auth standard columns with camelCase (requires double quotes)
    await knex.raw(`
        DO $$ 
        BEGIN
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'session' AND column_name = 'expiresAt') THEN
                ALTER TABLE session ADD COLUMN "expiresAt" TIMESTAMP WITH TIME ZONE NOT NULL;
            END IF;
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'session' AND column_name = 'createdAt') THEN
                ALTER TABLE session ADD COLUMN "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW();
            END IF;
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'session' AND column_name = 'updatedAt') THEN
                ALTER TABLE session ADD COLUMN "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW();
            END IF;
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'session' AND column_name = 'ipAddress') THEN
                ALTER TABLE session ADD COLUMN "ipAddress" TEXT;
            END IF;
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'session' AND column_name = 'userAgent') THEN
                ALTER TABLE session ADD COLUMN "userAgent" TEXT;
            END IF;
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'session' AND column_name = 'userId') THEN
                ALTER TABLE session ADD COLUMN "userId" TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE;
            END IF;
        END $$;
    `)

    // Accounts table
    // Using camelCase for Better Auth standard columns
    await knex.schema.createTable('account', (table) => {
        table.text('id').primary()
        table.text('scope')
        table.text('password')
    })

    // Add Better Auth standard columns with camelCase (requires double quotes)
    await knex.raw(`
        DO $$ 
        BEGIN
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'account' AND column_name = 'accountId') THEN
                ALTER TABLE account ADD COLUMN "accountId" TEXT NOT NULL;
            END IF;
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'account' AND column_name = 'providerId') THEN
                ALTER TABLE account ADD COLUMN "providerId" TEXT NOT NULL;
            END IF;
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'account' AND column_name = 'userId') THEN
                ALTER TABLE account ADD COLUMN "userId" TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE;
            END IF;
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'account' AND column_name = 'accessToken') THEN
                ALTER TABLE account ADD COLUMN "accessToken" TEXT;
            END IF;
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'account' AND column_name = 'refreshToken') THEN
                ALTER TABLE account ADD COLUMN "refreshToken" TEXT;
            END IF;
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'account' AND column_name = 'accessTokenExpiresAt') THEN
                ALTER TABLE account ADD COLUMN "accessTokenExpiresAt" TIMESTAMP WITH TIME ZONE;
            END IF;
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'account' AND column_name = 'refreshTokenExpiresAt') THEN
                ALTER TABLE account ADD COLUMN "refreshTokenExpiresAt" TIMESTAMP WITH TIME ZONE;
            END IF;
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'account' AND column_name = 'createdAt') THEN
                ALTER TABLE account ADD COLUMN "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW();
            END IF;
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'account' AND column_name = 'updatedAt') THEN
                ALTER TABLE account ADD COLUMN "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW();
            END IF;
        END $$;
    `)

    // Verification table
    // Using camelCase for Better Auth standard columns
    await knex.schema.createTable('verification', (table) => {
        table.text('id').primary()
        table.text('identifier').notNullable()
        table.text('value').notNullable()
    })

    // Add Better Auth standard columns with camelCase (requires double quotes)
    await knex.raw(`
        DO $$ 
        BEGIN
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'verification' AND column_name = 'expiresAt') THEN
                ALTER TABLE verification ADD COLUMN "expiresAt" TIMESTAMP WITH TIME ZONE NOT NULL;
            END IF;
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'verification' AND column_name = 'createdAt') THEN
                ALTER TABLE verification ADD COLUMN "createdAt" TIMESTAMP WITH TIME ZONE;
            END IF;
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'verification' AND column_name = 'updatedAt') THEN
                ALTER TABLE verification ADD COLUMN "updatedAt" TIMESTAMP WITH TIME ZONE;
            END IF;
        END $$;
    `)

    // Create a view to alias 'user' table as 'users' for foreign key compatibility
    await knex.raw('CREATE VIEW users AS SELECT * FROM "user"')

    // ===== Initial Schema =====

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
        table.integer('metacritic').nullable()
        table.integer('rawg_id').unique().nullable()
        table.timestamp('last_synced_at', { useTz: true }).nullable()
        table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now())

        table.index('name', 'games_name_idx')
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
        table.integer('session_elapsed_ms')
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

    // ===== Import States =====

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

    // ===== Seed Initial Admin User =====
    // Create admin user if it doesn't exist
    const existingUser = await knex('user')
        .where('email', 'admin@thebox.local')
        .first()

    if (!existingUser) {
        try {
            const userId = randomBytes(16).toString('hex')
            const hashedPassword = await hashPassword('admin123')
            const now = new Date()

            // Insert user into better-auth's user table (using camelCase for Better Auth columns)
            await knex('user').insert({
                id: userId,
                email: 'admin@thebox.local',
                name: 'admin',
                emailVerified: true,
                role: 'admin',
                createdAt: now,
                updatedAt: now,
                // Custom fields (snake_case as defined in schema)
                username: 'admin',
                display_username: 'admin',
                display_name: 'Administrator',
                total_score: 0,
                current_streak: 0,
                longest_streak: 0,
            })

            // Insert account for credential-based auth (password stored here, using camelCase)
            await knex('account').insert({
                id: randomBytes(16).toString('hex'),
                userId: userId,
                providerId: 'credential',
                accountId: userId,
                password: hashedPassword,
                createdAt: now,
                updatedAt: now,
            })

            console.log('Admin user created successfully:')
            console.log('  Email: admin@thebox.local')
            console.log('  Username: admin')
            console.log('  Password: admin123')
            console.log('  Role: admin')
        } catch (error) {
            console.error('Failed to create admin user:', error)
            throw error
        }
    }
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

    // Drop the users view first
    await knex.raw('DROP VIEW IF EXISTS users')

    // Drop better-auth tables
    await knex.schema.dropTableIfExists('verification')
    await knex.schema.dropTableIfExists('account')
    await knex.schema.dropTableIfExists('session')
    await knex.schema.dropTableIfExists('user')
}
