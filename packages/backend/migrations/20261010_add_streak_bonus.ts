import type { Knex } from 'knex'

/**
 * In-game streak bonus (flat points for 3 / 5 / 10 consecutive screenshots
 * solved on the first try, see guess-scoring.service.ts).
 *
 * `game_sessions.streak_bonus_enabled` keeps the change non-retroactive:
 * the column is added with DEFAULT false, so every existing session
 * (finished, or in progress at deploy time) is marked false and keeps its
 * scoring. The default then flips to true, so only sessions started after
 * the migration earn the bonus. Nothing is recomputed.
 *
 * `guesses.streak_bonus` stores the bonus included in `score_earned`, so the
 * history surfaces can show it and the admin score-recalculation job can add
 * it back instead of erasing it. Historical rows stay 0.
 *
 * `game_sessions.streak_bonus_total` is the sum of those bonuses for the
 * session. "Perfect game" (achievements, profile stats) is defined on the
 * speed score, `total_score - streak_bonus_total = 2000`, because a perfect
 * run now totals 2,000 to 2,175 depending on its streaks.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('game_sessions', (table) => {
    table.boolean('streak_bonus_enabled').notNullable().defaultTo(false)
    table.integer('streak_bonus_total').notNullable().defaultTo(0)
  })
  await knex.schema.alterTable('game_sessions', (table) => {
    table.boolean('streak_bonus_enabled').notNullable().defaultTo(true).alter()
  })
  await knex.schema.alterTable('guesses', (table) => {
    table.integer('streak_bonus').notNullable().defaultTo(0)
  })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('guesses', (table) => {
    table.dropColumn('streak_bonus')
  })
  await knex.schema.alterTable('game_sessions', (table) => {
    table.dropColumn('streak_bonus_enabled')
    table.dropColumn('streak_bonus_total')
  })
}
