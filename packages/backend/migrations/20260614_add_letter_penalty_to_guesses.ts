import type { Knex } from 'knex'

/**
 * Persists the letter-reveal penalty (in points) that was deducted from a
 * correct guess's score. The penalty is computed at submit time in
 * game.service from the cumulative `penalty_pct` locked in at reveal time,
 * then subtracted from `score_earned` — so the cost is baked into the stored
 * score and can't be reconstructed afterwards (the second-chance floor and
 * rounding make back-calculation lossy). Storing the points directly lets the
 * session-details / history / leaderboard recap surface the cost the same way
 * the live post-guess result already does.
 *
 * Historical rows predate the column and stay 0 — no backfill is possible.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('guesses', (table) => {
    table.integer('letter_penalty').notNullable().defaultTo(0)
  })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('guesses', (table) => {
    table.dropColumn('letter_penalty')
  })
}
