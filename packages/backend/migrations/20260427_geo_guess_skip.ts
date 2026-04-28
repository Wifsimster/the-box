import type { Knex } from 'knex'

// Adds an `is_skip` flag to `geo_guess`. A skip is a deliberate
// "I don't recognize this game" — written as a real row so the existing
// PK `(user_id, geo_challenge_id)` keeps locking the slot for the day
// (no skip-then-guess after asking Discord), but excluded from the
// community-average aggregate (`getChallengeStats`) and from the
// `geo_leaderboard_daily` / `geo_leaderboard_monthly` upserts so it
// neither pollutes the average nor counts toward leaderboard rankings.
//
// Storing skips in the same table beats a sibling `geo_skip` table:
// a single uniqueness check covers "one terminal action per challenge"
// and `findGuess` keeps its existing signature.

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('geo_guess', (table) => {
    table.boolean('is_skip').notNullable().defaultTo(false)
  })

  // Partial index keeps the AVG(score) / COUNT(*) aggregate in
  // `getChallengeStats` cheap as the table grows: the stats query only
  // looks at attempted rows, so the index doesn't waste pages on skips.
  await knex.raw(`
    CREATE INDEX geo_guess_attempted_by_challenge
    ON geo_guess (geo_challenge_id)
    WHERE is_skip = false
  `)
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw('DROP INDEX IF EXISTS geo_guess_attempted_by_challenge')
  await knex.schema.alterTable('geo_guess', (table) => {
    table.dropColumn('is_skip')
  })
}
