import type { Knex } from 'knex'

/**
 * One-shot announcement email for the referral ("parrainage") feature.
 * Each user receives the email at most once — the timestamp doubles as
 * the dedupe key so a re-run of the job (e.g. after a crash mid-batch)
 * skips already-mailed users.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('user', (table) => {
    table.timestamp('referral_announcement_email_sent_at').nullable()
  })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('user', (table) => {
    table.dropColumn('referral_announcement_email_sent_at')
  })
}
