import type { Knex } from 'knex'

// Adds `is_anonymous` to geo_pin_submission so guest contributors
// (Better Auth anonymous sessions) can drop pins without being gated
// behind a sign-up wall.
//
// The column is non-nullable with a default of false because:
//   1. Every existing row was authored by a logged-in user — that
//      backfill is unambiguous.
//   2. The flag mirrors `req.user?.isAnonymous` at submit time, so
//      the absence of a value would itself be a bug (= unknown
//      provenance), not a meaningful state we want to preserve.
//
// An index is added since the consensus pipeline and admin moderation
// will both want to filter by/discount anon pins quickly.

export async function up(knex: Knex): Promise<void> {
  const exists = await knex.schema.hasColumn('geo_pin_submission', 'is_anonymous')
  if (exists) return
  await knex.schema.alterTable('geo_pin_submission', (t) => {
    t.boolean('is_anonymous').notNullable().defaultTo(false)
    t.index('is_anonymous', 'geo_pin_submission_is_anonymous_idx')
  })
}

export async function down(knex: Knex): Promise<void> {
  const exists = await knex.schema.hasColumn('geo_pin_submission', 'is_anonymous')
  if (!exists) return
  await knex.schema.alterTable('geo_pin_submission', (t) => {
    t.dropIndex('is_anonymous', 'geo_pin_submission_is_anonymous_idx')
    t.dropColumn('is_anonymous')
  })
}
