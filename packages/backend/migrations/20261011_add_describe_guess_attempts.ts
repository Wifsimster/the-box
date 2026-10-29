import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  const exists = await knex.schema.hasTable('describe_guess_attempts')
  if (exists) return

  await knex.schema.createTable('describe_guess_attempts', (table) => {
    table.increments('id').primary()
    table
      .text('user_id')
      .notNullable()
      .references('id')
      .inTable('user')
      .onDelete('CASCADE')
    table.boolean('is_guest').notNullable().defaultTo(false)
    table
      .uuid('game_session_id')
      .notNullable()
      .references('id')
      .inTable('game_sessions')
      .onDelete('CASCADE')
    table
      .uuid('tier_session_id')
      .notNullable()
      .references('id')
      .inTable('tier_sessions')
      .onDelete('CASCADE')
    table.integer('position').notNullable()
    table
      .integer('screenshot_id')
      .notNullable()
      .references('id')
      .inTable('screenshots')
      .onDelete('CASCADE')
    table.integer('target_game_id').notNullable()

    table.string('guess_text', 200).notNullable()
    table.string('description', 200).notNullable()
    table.string('locale', 8).notNullable()

    table.specificType('candidate_game_ids', 'integer[]').notNullable()
    table.integer('chosen_game_id').nullable()
    table.double('probability').nullable()
    table.boolean('accepted').nullable()
    table.double('threshold').nullable()
    table.boolean('title_prefilter_hit').notNullable().defaultTo(false)

    table.string('model', 64).notNullable()
    table.integer('latency_ms').nullable()
    table.integer('input_tokens').nullable()
    table.integer('output_tokens').nullable()
    table.string('error', 64).nullable()

    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now())

    table.unique(['tier_session_id', 'position'])
    table.index('created_at')
    table.index('user_id')
  })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('describe_guess_attempts')
}
