import type { Knex } from 'knex'

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
}
