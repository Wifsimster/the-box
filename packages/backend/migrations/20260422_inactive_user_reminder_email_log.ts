import type { Knex } from 'knex'

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
