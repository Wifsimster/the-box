import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('reactivation_holdouts', (table) => {
    table.string('user_id', 64).notNullable()
    table.string('week', 10).notNullable()
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now())

    table.primary(['user_id', 'week'], { constraintName: 'reactivation_holdouts_pkey' })
    table.index(['week'], 'reactivation_holdouts_week_idx')
  })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('reactivation_holdouts')
}
