import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('games', (table) => {
    table.integer('rawg_id').unique().nullable()
    table.timestamp('last_synced_at', { useTz: true }).nullable()
  })

  // Create indexes for efficient sync queries
  await knex.schema.alterTable('games', (table) => {
    table.index(['rawg_id'], 'idx_games_rawg_id')
    table.index(['last_synced_at'], 'idx_games_last_synced')
  })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('games', (table) => {
    table.dropIndex(['last_synced_at'], 'idx_games_last_synced')
    table.dropIndex(['rawg_id'], 'idx_games_rawg_id')
    table.dropColumn('last_synced_at')
    table.dropColumn('rawg_id')
  })
}
