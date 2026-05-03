import type { Knex } from 'knex'

// Activation log for the `second_chance` powerup. One row per
// (tier_session_id, position) — the UNIQUE constraint mechanically
// enforces the PRD's "max one per slot per session" rule, no service-layer
// counter needed. The row is inserted by the activation endpoint, read by
// `submitGuess` to apply the score floor on the next correct guess, and
// optionally annotated with `applied_to_guess_id` once the floor has
// kicked in (kept nullable for traceability).
//
// Design note (interpretation):
//   The PRD wording ("scoreCap = 0.7 × remainingMaxScore") would make the
//   powerup PUNITIVE inside the current game model — wrong guesses are
//   already free retries, so reducing future score on consumption gives
//   the player nothing. We interpret 70 % as a FLOOR instead: spending
//   a second_chance guarantees `max(scoreEarned, 0.7 × BASE_SCORE)` on
//   the next correct guess on this position. That is the only reading
//   that gives the powerup positive expected value within today's
//   mechanics. See docs/game-flow.md for the canonical contract.

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('position_second_chances', (table) => {
    table.bigIncrements('id').primary()
    // tier_sessions.id is uuid in the existing schema; mirror that here.
    table.uuid('tier_session_id').notNullable()
    table.integer('position').notNullable()
    table.timestamp('consumed_at', { useTz: true }).notNullable().defaultTo(knex.fn.now())
    // Filled in by submitGuess once the floor has actually been applied.
    // Until then the activation is "pending" — i.e. the player accepted
    // the modal but has not yet found the right answer.
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
