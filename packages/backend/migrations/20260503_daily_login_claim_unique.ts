import type { Knex } from 'knex'

const INDEX_NAME = 'login_reward_claims_user_id_claim_date_unique'

export async function up(knex: Knex): Promise<void> {
    await knex.raw(`
        DELETE FROM login_reward_claims a
        USING login_reward_claims b
        WHERE a.user_id = b.user_id
          AND (a.claimed_at AT TIME ZONE 'UTC')::date
            = (b.claimed_at AT TIME ZONE 'UTC')::date
          AND a.id > b.id
    `)

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
