import type { Knex } from 'knex'

// Server-authoritative round timer. Before this column, the speed multiplier
// in submitGuess was derived from `roundTimeTakenMs` taken from the request
// body — a player could send {roundTimeTakenMs: 1} and pin themselves at the
// top of the leaderboard.
//
// `round_started_at` is rewritten by getScreenshot whenever the client
// requests a new position so the server can compute the true elapsed
// time at submit. `round_position` lets submitGuess detect stale rows
// (out-of-order submissions, reloads, mid-round client crashes) and fall
// back to the client value rather than penalize a legitimate user.
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('tier_sessions', (table) => {
    table.timestamp('round_started_at', { useTz: true }).nullable()
    table.integer('round_position').nullable()
  })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('tier_sessions', (table) => {
    table.dropColumn('round_position')
    table.dropColumn('round_started_at')
  })
}
