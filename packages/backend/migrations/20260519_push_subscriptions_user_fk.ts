import type { Knex } from 'knex'

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
