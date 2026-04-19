import type { Knex } from 'knex'

/**
 * Tracks when the streak-risk win-back email was last sent to a user
 * so the recurring worker can skip users who already got today's nudge.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('user', (table) => {
    table.timestamp('last_streak_risk_email_at').nullable()
  })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('user', (table) => {
    table.dropColumn('last_streak_risk_email_at')
  })
}
