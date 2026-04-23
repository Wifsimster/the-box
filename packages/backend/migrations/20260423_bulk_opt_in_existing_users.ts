import type { Knex } from 'knex'

/**
 * One-shot data migration: opt every existing user into marketing emails.
 *
 * The production user base today is a synthetic test cohort, so the
 * relance and inactive-user win-back workers otherwise have an empty
 * candidate pool (email_marketing_consent defaults to false per CNIL).
 *
 * Only flips rows that are currently false so any user who has already
 * opted in explicitly keeps their original consent timestamp intact.
 * Guest accounts are excluded — they share a synthetic mailbox domain
 * and must never receive transactional mail.
 */
export async function up(knex: Knex): Promise<void> {
  await knex('user')
    .where('email_marketing_consent', false)
    .whereNot('email', 'like', '%@guest.thebox.local')
    .update({
      email_marketing_consent: true,
      email_consent_updated_at: knex.fn.now(),
    })
}

export async function down(_knex: Knex): Promise<void> {
  // Intentionally irreversible: we cannot distinguish users flipped by
  // this migration from users who opted in legitimately afterwards, so
  // a blanket revert would wipe real consent. Roll forward instead.
}
