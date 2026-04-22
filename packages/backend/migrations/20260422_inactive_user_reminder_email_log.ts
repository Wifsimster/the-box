import type { Knex } from 'knex'

/**
 * Tracks when the long-horizon "we miss you" win-back email was last sent
 * to a user so the recurring worker can enforce a multi-week cooldown
 * between re-engagement attempts for the same lapsed user.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('user', (table) => {
    table.timestamp('last_inactive_reminder_email_at').nullable()
  })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('user', (table) => {
    table.dropColumn('last_inactive_reminder_email_at')
  })
}
