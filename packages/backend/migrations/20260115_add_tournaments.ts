import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
    // Create tournaments table
    await knex.schema.createTable('tournaments', (table) => {
        table.increments('id').primary()
        table.string('name', 255).notNullable()
        table.string('type', 20).notNullable().comment('weekly or monthly')
        table.date('start_date').notNullable()
        table.date('end_date').notNullable()
        table.boolean('is_active').notNullable().defaultTo(true)
        table.text('prize_description')
        table.integer('max_participants').nullable()
        table.timestamp('created_at').notNullable().defaultTo(knex.fn.now())
        table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now())

        // Indexes for common queries
        table.index(['type', 'is_active'], 'idx_tournaments_type_active')
        table.index(['start_date', 'end_date'], 'idx_tournaments_dates')
    })

    // Create tournament_participants table
    await knex.schema.createTable('tournament_participants', (table) => {
        table.increments('id').primary()
        table.integer('tournament_id').notNullable()
            .references('id').inTable('tournaments').onDelete('CASCADE')
        table.text('user_id').notNullable()
            .references('id').inTable('user').onDelete('CASCADE')
        table.integer('total_score').notNullable().defaultTo(0)
        table.integer('challenges_completed').notNullable().defaultTo(0)
        table.integer('rank').nullable()
        table.timestamp('joined_at').notNullable().defaultTo(knex.fn.now())
        table.timestamp('last_updated_at').notNullable().defaultTo(knex.fn.now())

        // Unique constraint - one participation per tournament per user
        table.unique(['tournament_id', 'user_id'], {
            indexName: 'uq_tournament_participant',
        })

        // Index for leaderboard queries
        table.index(['tournament_id', 'total_score'], 'idx_tournament_leaderboard')
    })

    // Create tournament_notifications table
    await knex.schema.createTable('tournament_notifications', (table) => {
        table.increments('id').primary()
        table.integer('tournament_id').notNullable()
            .references('id').inTable('tournaments').onDelete('CASCADE')
        table.text('user_id').nullable()
            .references('id').inTable('user').onDelete('CASCADE')
            .comment('NULL for broadcast notifications')
        table.string('notification_type', 50).notNullable()
            .comment('start, reminder, results, prize_awarded')
        table.text('email_subject')
        table.text('email_body')
        table.boolean('is_sent').notNullable().defaultTo(false)
        table.timestamp('sent_at').nullable()
        table.timestamp('created_at').notNullable().defaultTo(knex.fn.now())

        // Index for processing unsent notifications
        table.index(['is_sent', 'created_at'], 'idx_tournament_notifications_pending')
        table.index(['tournament_id', 'notification_type'], 'idx_tournament_notifications_lookup')
    })

    // Create materialized view for tournament leaderboards (aggregated scores)
    await knex.raw(`
    CREATE MATERIALIZED VIEW tournament_leaderboard AS
    SELECT 
      t.id as tournament_id,
      u.id as user_id,
      u.username,
      u.display_name,
      u.avatar_url,
      COALESCE(SUM(gs.total_score), 0) as total_score,
      COALESCE(COUNT(DISTINCT gs.id) FILTER (WHERE gs.is_completed = true), 0) as challenges_completed,
      MAX(gs.completed_at) as last_played_at,
      RANK() OVER (PARTITION BY t.id ORDER BY COALESCE(SUM(gs.total_score), 0) DESC) as rank
    FROM tournaments t
    CROSS JOIN "user" u
    LEFT JOIN daily_challenges dc 
      ON dc.challenge_date >= t.start_date 
      AND dc.challenge_date <= t.end_date
    LEFT JOIN game_sessions gs 
      ON gs.daily_challenge_id = dc.id 
      AND gs.user_id = u.id
      AND gs.is_completed = true
    WHERE u."isAnonymous" = false
    GROUP BY t.id, u.id, u.username, u.display_name, u.avatar_url
  `)

    // Create index on materialized view
    await knex.raw(`
    CREATE INDEX idx_tournament_leaderboard_main 
    ON tournament_leaderboard(tournament_id, total_score DESC)
  `)

    console.log('✓ Created tournaments, tournament_participants, tournament_notifications tables')
    console.log('✓ Created tournament_leaderboard materialized view')
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw('DROP MATERIALIZED VIEW IF EXISTS tournament_leaderboard CASCADE')
    await knex.schema.dropTableIfExists('tournament_notifications')
    await knex.schema.dropTableIfExists('tournament_participants')
    await knex.schema.dropTableIfExists('tournaments')
    console.log('✓ Dropped tournament tables and materialized view')
}
