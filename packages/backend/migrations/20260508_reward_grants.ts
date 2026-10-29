import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('reward_grants', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'))
    table.string('user_id', 64).notNullable()
    table.string('source', 40).notNullable()
    table.string('source_ref', 120).notNullable()
    table.jsonb('payload').notNullable()
    table.timestamp('granted_at', { useTz: true }).notNullable().defaultTo(knex.fn.now())
    table.timestamp('unlocked_at', { useTz: true }).nullable()
    table.timestamp('claimed_at', { useTz: true }).nullable()

    table.unique(['user_id', 'source', 'source_ref'], {
      indexName: 'reward_grants_user_source_ref_uniq',
    })
    table.index(['user_id', 'claimed_at', 'granted_at'], 'reward_grants_inbox_idx')
  })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('reward_grants')
}
