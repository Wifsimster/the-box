import type { Knex } from 'knex'

/**
 * CNIL/GDPR-compliant marketing consent tracking.
 *
 * `email_marketing_consent` defaults to false — opt-in must be an
 * explicit user action. `email_consent_updated_at` records the last
 * change so audit requests can be answered.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('user', (table) => {
    table.boolean('email_marketing_consent').notNullable().defaultTo(false)
    table.timestamp('email_consent_updated_at').nullable()
  })

  await knex.raw(
    'CREATE INDEX idx_user_email_marketing_consent ON "user"(email_marketing_consent)'
  )
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw('DROP INDEX IF EXISTS idx_user_email_marketing_consent')

  await knex.schema.alterTable('user', (table) => {
    table.dropColumn('email_marketing_consent')
    table.dropColumn('email_consent_updated_at')
  })
}
