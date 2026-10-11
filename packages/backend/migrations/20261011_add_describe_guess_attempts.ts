import type { Knex } from 'knex'

/**
 * "Describe the game" in shadow mode (app settings describeGuess.*).
 *
 * There is no separate player UI: when a wrong guess typed in the normal guess
 * input looks like a description rather than a title, it is captured off the
 * request path and a model picks the game among the target and ~10 catalogue
 * distractors. Nothing is scored and nothing changes for the player: this
 * table only collects real descriptions and verdicts, so the acceptance
 * threshold and a partial-points scale can be set on real data later.
 *
 * One row per (tier_session_id, position): the first qualifying wrong guess on
 * a screenshot. The row is claimed before the model is called
 * (`error = 'pending'`) so two concurrent captures can't both reach the paid
 * API; the verdict columns are filled in afterwards.
 *
 * Personal data: `description` is free text written by the player. Rows follow
 * the account (ON DELETE CASCADE on user, like every other game table) and are
 * purged after 180 days by the data-retention job.
 */
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
    // Snapshot of `user.isAnonymous` at write time: guests are a separate
    // population worth telling apart when labelling.
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
    // The answer. No FK cascade on the catalogue side: deleting a game must
    // not silently drop labelled rows, so the ids are kept as plain integers.
    table.integer('target_game_id').notNullable()

    // The guess exactly as the player typed it, and the normalised text sent
    // to the judge (whitespace collapsed).
    table.string('guess_text', 200).notNullable()
    table.string('description', 200).notNullable()
    table.string('locale', 8).notNullable()

    // Candidate set shown to the model (target included), in prompt order.
    table.specificType('candidate_game_ids', 'integer[]').notNullable()
    table.integer('chosen_game_id').nullable()
    table.double('probability').nullable()
    // Model verdict at `threshold` (setting describeGuess.threshold, default
    // 0.8): chose the target with p >= threshold. Null when there is no
    // verdict (timeout, API error, invalid output).
    table.boolean('accepted').nullable()
    table.double('threshold').nullable()
    // The description names a candidate's title or alias (fuzzy matcher).
    table.boolean('title_prefilter_hit').notNullable().defaultTo(false)

    // Model id from the describeGuess.model setting at judgement time.
    table.string('model', 64).notNullable()
    table.integer('latency_ms').nullable()
    table.integer('input_tokens').nullable()
    table.integer('output_tokens').nullable()
    // 'pending' while the model runs; null on success; a short code otherwise
    // ('timeout', 'rate_limited', 'refusal', 'invalid_output', ...).
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
