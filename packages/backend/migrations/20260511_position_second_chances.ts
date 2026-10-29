import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('position_second_chances', (table) => {
    table.bigIncrements('id').primary()
    table.uuid('tier_session_id').notNullable()
    table.integer('position').notNullable()
    table.timestamp('consumed_at', { useTz: true }).notNullable().defaultTo(knex.fn.now())
    table.bigInteger('applied_to_guess_id').nullable()

    table.unique(['tier_session_id', 'position'], {
      indexName: 'position_second_chances_session_pos_uniq',
    })
    table.index(['tier_session_id'], 'position_second_chances_session_idx')
  })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('position_second_chances')
}
