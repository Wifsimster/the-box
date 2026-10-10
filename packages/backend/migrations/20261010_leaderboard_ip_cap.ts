import type { Knex } from 'knex'

// Per-connection cap on the daily leaderboard (brief "Linnaeus" point 5).
//
// `game_sessions.ip_capped` freezes the decision taken when a ranked daily
// session starts: true means the player's connection already had
// LEADERBOARD_IP_CAP other players that day, so the session is played and
// scored normally but never enters the daily/monthly leaderboard. Existing
// rows default to false, so boards already published are unchanged.
//
// `leaderboard_ip_slots` holds one row per (UTC day, keyed IP hash, user)
// for players who got a slot. No raw IP is stored: `ip_hash` is an
// HMAC-SHA256 whose key rotates every UTC day. Rows are purged once their
// day is over (see leaderboard-ip-cap.repository.ts).
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('game_sessions', (table) => {
    table.boolean('ip_capped').notNullable().defaultTo(false)
  })

  await knex.schema.createTable('leaderboard_ip_slots', (table) => {
    table.date('slot_date').notNullable()
    table.string('ip_hash', 64).notNullable()
    table.text('user_id').notNullable().references('id').inTable('user').onDelete('CASCADE')
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now())
    table.primary(['slot_date', 'ip_hash', 'user_id'])
  })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('leaderboard_ip_slots')
  await knex.schema.alterTable('game_sessions', (table) => {
    table.dropColumn('ip_capped')
  })
}
