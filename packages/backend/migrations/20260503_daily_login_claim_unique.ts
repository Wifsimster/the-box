import type { Knex } from 'knex'

const INDEX_NAME = 'login_reward_claims_user_id_claim_date_unique'

export async function up(knex: Knex): Promise<void> {
    // Enforce one claim per (user, UTC day). The expression on
    // (claimed_at AT TIME ZONE 'UTC')::date keeps the rule timezone-stable
    // regardless of process or DB session TZ.
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
