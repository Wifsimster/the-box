import type { Knex } from 'knex'

// Backfill rows that the timezone bug fixed in #267 left stranded.
//
// `startChallenge` was computing `todayStr` from `today.toISOString().split('T')[0]`
// after applying `today.setHours(0,0,0,0)` (local midnight). In the production
// container TZ (`Europe/Paris`, UTC+1/+2) local midnight maps to the previous
// UTC day, so the date-string comparison flagged every fresh daily session
// as `is_catch_up = true`. The leaderboard query filters those out, which
// emptied the daily leaderboard for every day the bug was live (the buggy
// code shipped with the file in commit e86f384 on 2026-05-15 and was fixed
// in commit 3a891d4 on 2026-05-21 ~07:24 UTC).
//
// A row is a false-positive catch-up iff the user started the session on the
// same UTC day as the challenge's `challenge_date`. Real catch-ups were
// started on a later UTC day, so they're untouched.
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
  // No-op: we can't reliably reconstruct which rows we flipped without
  // storing a marker, and re-flagging them to is_catch_up = true would just
  // restore the original bug. The data fix stands.
}
