import type { Knex } from 'knex'

/**
 * Migration to remove the duplicate custom 'users' table.
 *
 * The application now uses better-auth's 'user' table for all user data.
 * This migration:
 * 1. Converts user_id columns from UUID to TEXT (to match better-auth's user.id type)
 * 2. Updates foreign key references from 'users' to 'user'
 * 3. Drops the custom 'users' table
 */
export async function up(knex: Knex): Promise<void> {
  // Check if the custom 'users' table exists
  const hasUsersTable = await knex.schema.hasTable('users')
  if (!hasUsersTable) {
    console.log('Custom users table does not exist, skipping migration')
    return
  }

  // Check if better-auth's 'user' table exists
  const hasUserTable = await knex.schema.hasTable('user')
  if (!hasUserTable) {
    throw new Error("Better-auth 'user' table does not exist. Run 'npx @better-auth/cli migrate' first.")
  }

  // Update game_sessions: drop FK, convert user_id to TEXT, add new FK
  const hasGameSessions = await knex.schema.hasTable('game_sessions')
  if (hasGameSessions) {
    // Drop existing FK constraint if it exists
    const fkInfo = await knex.raw(`
      SELECT tc.constraint_name
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
      WHERE tc.table_name = 'game_sessions'
        AND tc.constraint_type = 'FOREIGN KEY'
        AND kcu.column_name = 'user_id'
    `)

    if (fkInfo.rows.length > 0) {
      await knex.schema.alterTable('game_sessions', (table) => {
        table.dropForeign(['user_id'])
      })
    }

    // Convert user_id from UUID to TEXT
    await knex.raw('ALTER TABLE game_sessions ALTER COLUMN user_id TYPE text USING user_id::text')

    // Add new FK to better-auth's user table
    await knex.schema.alterTable('game_sessions', (table) => {
      table.foreign('user_id').references('id').inTable('user').onDelete('CASCADE')
    })
    console.log('Updated game_sessions: converted user_id to TEXT and added FK to user table')
  }

  // Update live_event_participants: drop FK, convert user_id to TEXT, add new FK
  const hasLiveEventParticipants = await knex.schema.hasTable('live_event_participants')
  if (hasLiveEventParticipants) {
    const fkInfo = await knex.raw(`
      SELECT tc.constraint_name
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
      WHERE tc.table_name = 'live_event_participants'
        AND tc.constraint_type = 'FOREIGN KEY'
        AND kcu.column_name = 'user_id'
    `)

    if (fkInfo.rows.length > 0) {
      await knex.schema.alterTable('live_event_participants', (table) => {
        table.dropForeign(['user_id'])
      })
    }

    // Convert user_id from UUID to TEXT
    await knex.raw('ALTER TABLE live_event_participants ALTER COLUMN user_id TYPE text USING user_id::text')

    // Add new FK to better-auth's user table
    await knex.schema.alterTable('live_event_participants', (table) => {
      table.foreign('user_id').references('id').inTable('user').onDelete('CASCADE')
    })
    console.log('Updated live_event_participants: converted user_id to TEXT and added FK to user table')
  }

  // Drop the custom users table
  await knex.schema.dropTableIfExists('users')
  console.log('Dropped custom users table')
}

export async function down(knex: Knex): Promise<void> {
  // Recreate the custom users table for rollback
  const hasUsersTable = await knex.schema.hasTable('users')
  if (hasUsersTable) {
    return
  }

  await knex.raw('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"')

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

  // Restore foreign keys to point back to users table
  const hasGameSessions = await knex.schema.hasTable('game_sessions')
  if (hasGameSessions) {
    await knex.schema.alterTable('game_sessions', (table) => {
      table.dropForeign(['user_id'])
    })
    // Convert user_id back to UUID
    await knex.raw('ALTER TABLE game_sessions ALTER COLUMN user_id TYPE uuid USING user_id::uuid')
    await knex.schema.alterTable('game_sessions', (table) => {
      table.foreign('user_id').references('id').inTable('users').onDelete('CASCADE')
    })
  }

  const hasLiveEventParticipants = await knex.schema.hasTable('live_event_participants')
  if (hasLiveEventParticipants) {
    await knex.schema.alterTable('live_event_participants', (table) => {
      table.dropForeign(['user_id'])
    })
    // Convert user_id back to UUID
    await knex.raw('ALTER TABLE live_event_participants ALTER COLUMN user_id TYPE uuid USING user_id::uuid')
    await knex.schema.alterTable('live_event_participants', (table) => {
      table.foreign('user_id').references('id').inTable('users').onDelete('CASCADE')
    })
  }
}
