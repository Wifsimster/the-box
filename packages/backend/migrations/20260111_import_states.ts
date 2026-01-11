import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('import_states', (table) => {
    table.increments('id').primary()
    table.string('import_type', 50).notNullable().defaultTo('full-import')
    table.string('status', 50).notNullable().defaultTo('pending')

    // Configuration
    table.integer('batch_size').notNullable().defaultTo(100)
    table.integer('min_metacritic').notNullable().defaultTo(70)
    table.integer('screenshots_per_game').notNullable().defaultTo(3)

    // Progress tracking
    table.integer('total_games_available').nullable()
    table.integer('current_page').notNullable().defaultTo(1)
    table.integer('last_processed_offset').notNullable().defaultTo(0)
    table.integer('games_processed').notNullable().defaultTo(0)
    table.integer('games_imported').notNullable().defaultTo(0)
    table.integer('games_skipped').notNullable().defaultTo(0)
    table.integer('screenshots_downloaded').notNullable().defaultTo(0)
    table.integer('failed_count').notNullable().defaultTo(0)

    // Batch tracking
    table.integer('current_batch').notNullable().defaultTo(0)
    table.integer('total_batches_estimated').nullable()

    // Timestamps
    table.timestamp('started_at').nullable()
    table.timestamp('paused_at').nullable()
    table.timestamp('resumed_at').nullable()
    table.timestamp('completed_at').nullable()
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now())
    table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now())

    // Index for quick lookup of active imports
    table.index(['status'], 'idx_import_states_status')
  })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('import_states')
}
