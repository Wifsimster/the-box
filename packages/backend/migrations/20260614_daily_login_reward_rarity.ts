import type { Knex } from 'knex'

/**
 * Add a `rarity` tier to daily-login rewards. Rarity is a purely cosmetic
 * signal (colour + label + claim animation) layered on top of the existing
 * 7-day cycle to make the rewards feel more rewarding. It is independent
 * from `reward_type` (which describes the payload shape).
 *
 * Backfill follows the natural escalation of the 7-day cycle:
 *   day 1-2 -> common, day 3-4 -> uncommon, day 5 -> rare,
 *   day 6 -> epic, day 7 -> legendary.
 */

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

    // Backfill the seeded 7-day cycle.
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
