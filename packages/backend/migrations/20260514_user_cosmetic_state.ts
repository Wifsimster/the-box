import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('user_cosmetic_state', (table) => {
    table.string('user_id', 64).notNullable()
    table.string('slot', 32).notNullable()
    table.string('cosmetic_item_key', 100).notNullable()
    table.timestamp('equipped_at', { useTz: true }).notNullable().defaultTo(knex.fn.now())

    table.primary(['user_id', 'slot'], { constraintName: 'user_cosmetic_state_pkey' })
    table.index(['user_id'], 'user_cosmetic_state_user_idx')
  })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('user_cosmetic_state')
}
