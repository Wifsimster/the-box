import type { Knex } from 'knex'

const INDEX_NAME = 'login_reward_claims_user_id_claim_date_unique'

export async function up(knex: Knex): Promise<void> {
    // Pre-existing rows can violate (user_id, UTC day) uniqueness because
    // no constraint enforced it before this migration. Keep the earliest
    // claim per bucket — its reward was already applied to inventory and
    // score atomically with the insert, and those side effects don't
    // unwind when we delete a claim row, so the user's balance is
    // preserved. Later duplicates are the rows the index is meant to
    // prevent going forward.
    await knex.raw(`
        DELETE FROM login_reward_claims a
        USING login_reward_claims b
        WHERE a.user_id = b.user_id
          AND (a.claimed_at AT TIME ZONE 'UTC')::date
            = (b.claimed_at AT TIME ZONE 'UTC')::date
          AND a.id > b.id
    `)

    // Enforce one claim per (user, UTC day). Matches the app's day math
    // (daily-login.service.ts::getToday) so process / DB session TZ
    // doesn't affect uniqueness.
    await knex.raw(`
        CREATE UNIQUE INDEX IF NOT EXISTS ${INDEX_NAME}
        ON login_reward_claims (
            user_id,
            ((claimed_at AT TIME ZONE 'UTC')::date)
        )
    `)
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw(`DROP INDEX IF EXISTS ${INDEX_NAME}`)
}
