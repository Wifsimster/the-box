import type { Knex } from 'knex'

// 20260517 created push_subscriptions.user_id without a foreign key, so a
// user deletion left dangling rows that the fan-out worker would keep
// targeting until the push provider responded 410. This migration adds the
// missing FK with ON DELETE CASCADE, matching the pattern used by every
// other user-owned table (achievements, screenshot_reports, geo_*).
//
// We sweep orphan rows first because the FK creation will fail on any
// existing user_id that no longer exists in the user table — and dev DBs
// that ran 20260517 before this fix may already contain such rows.

export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    DELETE FROM push_subscriptions
    WHERE user_id NOT IN (SELECT id FROM "user")
  `)

  await knex.schema.alterTable('push_subscriptions', (table) => {
    table
      .foreign('user_id', 'push_subscriptions_user_id_fk')
      .references('id')
      .inTable('user')
      .onDelete('CASCADE')
  })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('push_subscriptions', (table) => {
    table.dropForeign('user_id', 'push_subscriptions_user_id_fk')
  })
}
