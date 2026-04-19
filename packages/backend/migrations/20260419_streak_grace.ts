import type { Knex } from 'knex'

/**
 * Streak grace period: 1 free missed day per 7-day rolling window.
 *
 * `streak_grace_used_at` records when the user last consumed their grace.
 * When a user misses a single day, the streak code checks this field —
 * if unused or older than 7 days, it increments streak instead of
 * resetting, and stamps the field. This reduces churn from users who
 * break a streak by accident.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('user', (table) => {
    table.timestamp('streak_grace_used_at', { useTz: true }).nullable()
  })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('user', (table) => {
    table.dropColumn('streak_grace_used_at')
  })
}
