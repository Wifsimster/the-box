import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
    await knex.schema.createTable('daily_login_rewards', (table) => {
        table.increments('id').primary()
        table.integer('day_number').notNullable().unique().comment('Day in the 7-day cycle (1-7)')
        table.string('reward_type', 50).notNullable().comment('Type: powerup, points, legendary')
        table.jsonb('reward_value').notNullable().comment('Reward details: {items: [...], points: number}')
        table.string('display_name', 255).notNullable().comment('Display name for the reward')
        table.text('description').comment('Human-readable description')
        table.string('icon_url', 500).comment('Icon or emoji for the reward')
        table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now())
    })

    await knex.schema.createTable('user_login_streaks', (table) => {
        table.increments('id').primary()
        table.text('user_id').notNullable().references('id').inTable('user').onDelete('CASCADE')
        table.integer('current_login_streak').notNullable().defaultTo(0).comment('Current consecutive login days')
        table.integer('longest_login_streak').notNullable().defaultTo(0).comment('All-time longest streak')
        table.date('last_login_date').comment('Last date user logged in')
        table.date('last_claimed_date').comment('Last date user claimed reward')
        table.integer('current_day_in_cycle').notNullable().defaultTo(1).comment('Current day in 7-day reward cycle (1-7)')
        table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now())
        table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now())

        table.unique(['user_id'])
        table.index('last_login_date')
    })

    await knex.schema.createTable('user_inventory', (table) => {
        table.increments('id').primary()
        table.text('user_id').notNullable().references('id').inTable('user').onDelete('CASCADE')
        table.string('item_type', 50).notNullable().comment('Type: powerup, currency, etc.')
        table.string('item_key', 100).notNullable().comment('Specific item: hint_year, hint_publisher, etc.')
        table.integer('quantity').notNullable().defaultTo(0).comment('Amount owned')
        table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now())
        table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now())

        table.unique(['user_id', 'item_type', 'item_key'])
        table.index('user_id')
    })

    await knex.schema.createTable('login_reward_claims', (table) => {
        table.increments('id').primary()
        table.text('user_id').notNullable().references('id').inTable('user').onDelete('CASCADE')
        table.integer('reward_id').notNullable().references('id').inTable('daily_login_rewards').onDelete('CASCADE')
        table.integer('day_number').notNullable().comment('Day number at time of claim')
        table.integer('streak_at_claim').notNullable().comment('Streak count when claimed')
        table.timestamp('claimed_at', { useTz: true }).notNullable().defaultTo(knex.fn.now())

        table.index('user_id')
        table.index('claimed_at')
    })

    const rewards = [
        {
            day_number: 1,
            reward_type: 'powerup',
            reward_value: JSON.stringify({ items: [{ key: 'hint_year', quantity: 1 }], points: 0 }),
            display_name: 'Indice Année',
            description: 'Obtenez un indice sur l\'année de sortie du jeu',
            icon_url: '📅',
        },
        {
            day_number: 2,
            reward_type: 'powerup',
            reward_value: JSON.stringify({ items: [{ key: 'hint_publisher', quantity: 1 }], points: 0 }),
            display_name: 'Indice Éditeur',
            description: 'Obtenez un indice sur l\'éditeur du jeu',
            icon_url: '🏢',
        },
        {
            day_number: 3,
            reward_type: 'points',
            reward_value: JSON.stringify({ items: [], points: 100 }),
            display_name: '100 Points',
            description: 'Bonus de 100 points ajoutés à votre score',
            icon_url: '⭐',
        },
        {
            day_number: 4,
            reward_type: 'powerup',
            reward_value: JSON.stringify({ items: [{ key: 'hint_year', quantity: 2 }], points: 0 }),
            display_name: '2x Indice Année',
            description: 'Obtenez deux indices sur l\'année de sortie',
            icon_url: '📅📅',
        },
        {
            day_number: 5,
            reward_type: 'powerup',
            reward_value: JSON.stringify({ items: [{ key: 'hint_publisher', quantity: 2 }], points: 0 }),
            display_name: '2x Indice Éditeur',
            description: 'Obtenez deux indices sur l\'éditeur',
            icon_url: '🏢🏢',
        },
        {
            day_number: 6,
            reward_type: 'points',
            reward_value: JSON.stringify({ items: [], points: 250 }),
            display_name: '250 Points',
            description: 'Gros bonus de 250 points',
            icon_url: '🌟',
        },
        {
            day_number: 7,
            reward_type: 'legendary',
            reward_value: JSON.stringify({
                items: [
                    { key: 'hint_year', quantity: 2 },
                    { key: 'hint_publisher', quantity: 2 },
                ],
                points: 500,
            }),
            display_name: 'Coffre Légendaire',
            description: 'Le coffre ultime: 2x chaque indice + 500 points!',
            icon_url: '🎁',
        },
    ]

    await knex('daily_login_rewards').insert(rewards)
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTableIfExists('login_reward_claims')
    await knex.schema.dropTableIfExists('user_inventory')
    await knex.schema.dropTableIfExists('user_login_streaks')
    await knex.schema.dropTableIfExists('daily_login_rewards')
}
