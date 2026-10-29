import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('email_log', (table) => {
    table.increments('id').primary()
    table.string('user_id').nullable()
    table.string('recipient', 320).notNullable()
    table.string('type', 64).notNullable()
    table.string('subject', 512).notNullable()
    table.string('status', 16).notNullable()
    table.string('provider_message_id').nullable()
    table.string('error_message', 1024).nullable()
    table.timestamp('sent_at').notNullable().defaultTo(knex.fn.now())

    table.index('sent_at')
    table.index('user_id')
    table.index('type')
    table.index('status')
  })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('email_log')
}
