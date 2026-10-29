import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    UPDATE game_sessions gs
    SET is_catch_up = false
    FROM daily_challenges dc
    WHERE gs.daily_challenge_id = dc.id
      AND gs.is_catch_up = true
      AND (gs.started_at AT TIME ZONE 'UTC')::date = dc.challenge_date
  `)
}

export async function down(_knex: Knex): Promise<void> {
}
