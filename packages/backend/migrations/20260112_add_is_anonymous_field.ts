import type { Knex } from 'knex'

/**
 * Add isAnonymous field to user table for better-auth anonymous plugin
 */
export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable('user', (table) => {
        table.boolean('isAnonymous').notNullable().defaultTo(false)
    })
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable('user', (table) => {
        table.dropColumn('isAnonymous')
    })
}
