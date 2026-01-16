import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
    // Create achievements table
    await knex.schema.createTable('achievements', (table) => {
        table.increments('id').primary()
        table.string('key', 100).unique().notNullable().comment('Unique identifier for achievement (e.g., "speed_demon")')
        table.string('name', 255).notNullable().comment('Display name (e.g., "Speed Demon")')
        table.text('description').comment('Human-readable description')
        table.string('category', 50).notNullable().comment('Category: speed, accuracy, streak, genre, etc.')
        table.string('icon_url', 500).comment('URL or icon identifier')
        table.integer('points').notNullable().defaultTo(0).comment('Achievement point value')
        table.jsonb('criteria').comment('JSON criteria for achievement logic')
        table.integer('tier').notNullable().defaultTo(1).comment('Difficulty tier (1=easy, 2=medium, 3=hard)')
        table.boolean('is_hidden').notNullable().defaultTo(false).comment('Hide until earned')
        table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now())

        table.index('category')
        table.index('tier')
    })

    // Create user_achievements table (junction table with progress tracking)
    await knex.schema.createTable('user_achievements', (table) => {
        table.increments('id').primary()
        table.text('user_id').notNullable().references('id').inTable('user').onDelete('CASCADE')
        table.integer('achievement_id').notNullable().references('id').inTable('achievements').onDelete('CASCADE')
        table.timestamp('earned_at', { useTz: true }).notNullable().defaultTo(knex.fn.now())
        table.integer('progress').notNullable().defaultTo(0).comment('Current progress value')
        table.integer('progress_max').comment('Max progress needed (if applicable)')
        table.jsonb('metadata').comment('Additional context (e.g., which genre for genre achievements)')

        table.unique(['user_id', 'achievement_id'])
        table.index('user_id')
        table.index('achievement_id')
        table.index('earned_at')
    })

    // Seed initial achievements
    const achievements = [
        // Speed-based achievements
        {
            key: 'speed_demon',
            name: 'Speed Demon',
            description: 'Get 3 perfect speed guesses in a row (under 3 seconds each)',
            category: 'speed',
            icon_url: '⚡',
            points: 50,
            tier: 2,
            criteria: { type: 'consecutive_speed', count: 3, max_time_ms: 3000 },
        },
        {
            key: 'lightning_reflexes',
            name: 'Lightning Reflexes',
            description: 'Answer 10 screenshots in under 3 seconds',
            category: 'speed',
            icon_url: '⚡',
            points: 100,
            tier: 3,
            criteria: { type: 'total_speed', count: 10, max_time_ms: 3000 },
        },
        {
            key: 'quick_draw',
            name: 'Quick Draw',
            description: 'Answer any screenshot in under 2 seconds',
            category: 'speed',
            icon_url: '🎯',
            points: 25,
            tier: 1,
            criteria: { type: 'single_speed', count: 1, max_time_ms: 2000 },
        },

        // Accuracy-based achievements
        {
            key: 'no_hints_needed',
            name: 'No Hints Needed',
            description: 'Complete a daily challenge without using any hints',
            category: 'accuracy',
            icon_url: '🧠',
            points: 30,
            tier: 1,
            criteria: { type: 'no_hints', count: 1 },
        },
        {
            key: 'hint_free_master',
            name: 'Hint-Free Master',
            description: 'Complete 10 daily challenges without using hints',
            category: 'accuracy',
            icon_url: '🧠',
            points: 150,
            tier: 3,
            criteria: { type: 'no_hints', count: 10 },
        },
        {
            key: 'sharp_eye',
            name: 'Sharp Eye',
            description: 'Get 10 correct guesses in a row with no wrong answers',
            category: 'accuracy',
            icon_url: '👁️',
            points: 75,
            tier: 2,
            criteria: { type: 'consecutive_correct', count: 10 },
        },

        // Score-based achievements
        {
            key: 'perfect_run',
            name: 'Perfect Run',
            description: 'Score exactly 2000 points in a single challenge',
            category: 'score',
            icon_url: '💯',
            points: 100,
            tier: 3,
            criteria: { type: 'perfect_score', score: 2000 },
        },
        {
            key: 'high_roller',
            name: 'High Roller',
            description: 'Score over 1800 points in a single challenge',
            category: 'score',
            icon_url: '🎲',
            points: 50,
            tier: 2,
            criteria: { type: 'min_score', score: 1800 },
        },

        // Streak-based achievements
        {
            key: 'dedicated_player',
            name: 'Dedicated Player',
            description: 'Maintain a 3-day play streak',
            category: 'streak',
            icon_url: '🔥',
            points: 25,
            tier: 1,
            criteria: { type: 'streak', days: 3 },
        },
        {
            key: 'weekly_warrior',
            name: 'Weekly Warrior',
            description: 'Maintain a 7-day play streak',
            category: 'streak',
            icon_url: '🔥',
            points: 75,
            tier: 2,
            criteria: { type: 'streak', days: 7 },
        },
        {
            key: 'month_master',
            name: 'Month Master',
            description: 'Maintain a 30-day play streak',
            category: 'streak',
            icon_url: '🔥',
            points: 300,
            tier: 3,
            criteria: { type: 'streak', days: 30 },
        },

        // Genre-based achievements
        {
            key: 'rpg_expert',
            name: 'RPG Expert',
            description: 'Correctly identify 10 RPG games',
            category: 'genre',
            icon_url: '🗡️',
            points: 50,
            tier: 2,
            criteria: { type: 'genre_master', genre: 'RPG', count: 10 },
        },
        {
            key: 'action_hero',
            name: 'Action Hero',
            description: 'Correctly identify 10 Action games',
            category: 'genre',
            icon_url: '💥',
            points: 50,
            tier: 2,
            criteria: { type: 'genre_master', genre: 'Action', count: 10 },
        },
        {
            key: 'strategy_savant',
            name: 'Strategy Savant',
            description: 'Correctly identify 10 Strategy games',
            category: 'genre',
            icon_url: '♟️',
            points: 50,
            tier: 2,
            criteria: { type: 'genre_master', genre: 'Strategy', count: 10 },
        },

        // Completion achievements
        {
            key: 'first_win',
            name: 'First Win',
            description: 'Complete your first daily challenge',
            category: 'completion',
            icon_url: '🎮',
            points: 10,
            tier: 1,
            criteria: { type: 'challenges_completed', count: 1 },
        },
        {
            key: 'century_club',
            name: 'Century Club',
            description: 'Complete 100 daily challenges',
            category: 'completion',
            icon_url: '💯',
            points: 200,
            tier: 3,
            criteria: { type: 'challenges_completed', count: 100 },
        },

        // Competitive achievements
        {
            key: 'top_ten',
            name: 'Top 10',
            description: 'Rank in the top 10 on any daily challenge',
            category: 'competitive',
            icon_url: '🏆',
            points: 50,
            tier: 2,
            criteria: { type: 'leaderboard_rank', max_rank: 10 },
        },
        {
            key: 'podium_finish',
            name: 'Podium Finish',
            description: 'Rank in the top 3 on any daily challenge',
            category: 'competitive',
            icon_url: '🥉',
            points: 100,
            tier: 3,
            criteria: { type: 'leaderboard_rank', max_rank: 3 },
        },
        {
            key: 'champion',
            name: 'Champion',
            description: 'Achieve 1st place on any daily challenge',
            category: 'competitive',
            icon_url: '👑',
            points: 200,
            tier: 3,
            criteria: { type: 'leaderboard_rank', max_rank: 1 },
        },
    ]

    await knex('achievements').insert(achievements)
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTableIfExists('user_achievements')
    await knex.schema.dropTableIfExists('achievements')
}
