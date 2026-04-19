import type { Knex } from 'knex'

/**
 * Tracks when the daily-reward "relance" (re-engagement) email was last
 * sent to a user so the recurring worker can skip users who already got
 * today's nudge and respect the cross-cooldown with streak-risk emails.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('user', (table) => {
    table.timestamp('last_relance_email_at').nullable()
  })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('user', (table) => {
    table.dropColumn('last_relance_email_at')
  })
}
