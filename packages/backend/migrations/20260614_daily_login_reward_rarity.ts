import type { Knex } from 'knex'

const RARITY_BY_DAY: Record<number, string> = {
    1: 'common',
    2: 'common',
    3: 'uncommon',
    4: 'uncommon',
    5: 'rare',
    6: 'epic',
    7: 'legendary',
}

export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable('daily_login_rewards', (table) => {
        table
            .string('rarity', 20)
            .notNullable()
            .defaultTo('common')
            .comment('Cosmetic rarity tier: common, uncommon, rare, epic, legendary')
    })

    for (const [day, rarity] of Object.entries(RARITY_BY_DAY)) {
        await knex('daily_login_rewards')
            .where('day_number', Number(day))
            .update({ rarity })
    }
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable('daily_login_rewards', (table) => {
        table.dropColumn('rarity')
    })
}
